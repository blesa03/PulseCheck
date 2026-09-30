import socket
import ssl
import time
from dataclasses import dataclass

import httpx
from django.db import transaction
from django.utils import timezone

from monitors.models import CheckResult, Monitor
from monitors.services.metrics import (
    update_daily_metric,
)
from monitors.services.states import (
    apply_check_result_state,
)

MAX_REDIRECTS = 5

USER_AGENT = "PulseCheck/0.1"


class MonitorCheckDisabled(Exception):
    pass


@dataclass(frozen=True)
class HttpCheckOutcome:
    result: str
    http_status: int | None
    response_time_ms: int
    error_type: str | None
    checked_at: object


def _elapsed_ms(
    started_at: float,
) -> int:
    return max(
        0,
        round((time.perf_counter() - started_at) * 1000),
    )


def _exception_chain(
    exception: BaseException,
):
    current: BaseException | None = exception

    seen: set[int] = set()

    while current is not None:
        identity = id(current)

        if identity in seen:
            break

        seen.add(identity)

        yield current

        current = current.__cause__ or current.__context__


def classify_request_error(
    exception: httpx.RequestError,
) -> str:
    if isinstance(
        exception,
        httpx.TimeoutException,
    ):
        return CheckResult.ErrorType.TIMEOUT

    if isinstance(
        exception,
        httpx.TooManyRedirects,
    ):
        return CheckResult.ErrorType.TOO_MANY_REDIRECTS

    chain = list(
        _exception_chain(exception),
    )

    if any(isinstance(item, ssl.SSLError) for item in chain):
        return CheckResult.ErrorType.SSL_ERROR

    if any(isinstance(item, socket.gaierror) for item in chain):
        return CheckResult.ErrorType.DNS_ERROR

    message = str(exception).lower()

    dns_fragments = (
        "name or service not known",
        "temporary failure in name resolution",
        "nodename nor servname",
        "getaddrinfo failed",
    )

    if any(fragment in message for fragment in dns_fragments):
        return CheckResult.ErrorType.DNS_ERROR

    ssl_fragments = (
        "certificate verify failed",
        "ssl:",
        "tls:",
    )

    if any(fragment in message for fragment in ssl_fragments):
        return CheckResult.ErrorType.SSL_ERROR

    return CheckResult.ErrorType.CONNECTION_ERROR


def is_status_accepted(
    status_code: int,
    accepted_status_ranges: list[dict],
) -> bool:
    return any(
        status_range["min"] <= status_code <= status_range["max"]
        for status_range in accepted_status_ranges
    )


def perform_http_check(
    monitor: Monitor,
    *,
    transport=None,
) -> HttpCheckOutcome:
    started_at = time.perf_counter()

    client_options = {
        "timeout": httpx.Timeout(
            float(
                monitor.timeout_seconds,
            )
        ),
        "follow_redirects": (monitor.follow_redirects),
        "max_redirects": MAX_REDIRECTS,
        "headers": {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        },
    }

    if transport is not None:
        client_options["transport"] = transport

    try:
        with httpx.Client(
            **client_options,
        ) as client:
            with client.stream(
                "GET",
                monitor.url,
            ) as response:
                response_time_ms = _elapsed_ms(
                    started_at,
                )

                accepted = is_status_accepted(
                    response.status_code,
                    monitor.accepted_status_ranges,
                )

                return HttpCheckOutcome(
                    result=(CheckResult.Result.SUCCESS if accepted else CheckResult.Result.FAILURE),
                    http_status=(response.status_code),
                    response_time_ms=(response_time_ms),
                    error_type=None,
                    checked_at=timezone.now(),
                )

    except httpx.RequestError as exc:
        return HttpCheckOutcome(
            result=CheckResult.Result.FAILURE,
            http_status=None,
            response_time_ms=_elapsed_ms(
                started_at,
            ),
            error_type=classify_request_error(
                exc,
            ),
            checked_at=timezone.now(),
        )


@transaction.atomic
def record_check_result(
    monitor: Monitor,
    outcome: HttpCheckOutcome,
) -> CheckResult:
    locked_monitor = Monitor.objects.select_for_update().get(
        pk=monitor.pk,
    )

    check_result = CheckResult.objects.create(
        monitor=locked_monitor,
        result=outcome.result,
        http_status=(outcome.http_status),
        response_time_ms=(outcome.response_time_ms),
        error_type=(outcome.error_type),
        checked_at=(outcome.checked_at),
    )

    update_daily_metric(
        locked_monitor,
        check_result,
    )

    apply_check_result_state(
        locked_monitor,
        check_result,
    )

    monitor.status = locked_monitor.status

    monitor.consecutive_failures = locked_monitor.consecutive_failures

    monitor.consecutive_successes = locked_monitor.consecutive_successes

    monitor.last_checked_at = locked_monitor.last_checked_at

    return check_result


def execute_monitor_check(
    monitor: Monitor,
    *,
    transport=None,
) -> CheckResult:
    if not monitor.enabled:
        raise MonitorCheckDisabled

    outcome = perform_http_check(
        monitor,
        transport=transport,
    )

    return record_check_result(
        monitor,
        outcome,
    )
