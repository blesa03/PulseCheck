import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from django.db import transaction
from django.utils import timezone

from monitors.models import CheckResult, Monitor
from monitors.services.metrics import update_daily_metric
from monitors.services.states import apply_check_result_state
from monitors.services.target_policy import (
    UnsafeTarget,
    resolve_public_ip,
    validate_target_url,
)

MAX_REDIRECTS = 5
USER_AGENT = "PulseCheck/0.1"
REDIRECT_CODES = {301, 302, 303, 307, 308}


class MonitorCheckDisabled(Exception):
    pass


class MonitorCheckObsolete(Exception):
    pass


@dataclass(frozen=True)
class HttpCheckOutcome:
    result: str
    http_status: int | None
    response_time_ms: int
    error_type: str | None
    checked_at: object


def _elapsed_ms(started_at: float) -> int:
    return max(0, round((time.perf_counter() - started_at) * 1000))


def _exception_chain(exception: BaseException):
    current: BaseException | None = exception
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def classify_request_error(exception: httpx.RequestError) -> str:
    if isinstance(exception, httpx.TimeoutException):
        return CheckResult.ErrorType.TIMEOUT
    if isinstance(exception, httpx.TooManyRedirects):
        return CheckResult.ErrorType.TOO_MANY_REDIRECTS

    chain = list(_exception_chain(exception))
    if any(isinstance(item, ssl.SSLError) for item in chain):
        return CheckResult.ErrorType.SSL_ERROR
    if any(isinstance(item, socket.gaierror) for item in chain):
        return CheckResult.ErrorType.DNS_ERROR

    message = str(exception).lower()
    if any(
        part in message
        for part in (
            "name or service not known",
            "temporary failure in name resolution",
            "nodename nor servname",
            "getaddrinfo failed",
        )
    ):
        return CheckResult.ErrorType.DNS_ERROR
    if any(
        part in message
        for part in (
            "certificate verify failed",
            "ssl:",
            "tls:",
        )
    ):
        return CheckResult.ErrorType.SSL_ERROR
    return CheckResult.ErrorType.CONNECTION_ERROR


def is_status_accepted(status_code: int, accepted_status_ranges: list[dict]) -> bool:
    return any(item["min"] <= status_code <= item["max"] for item in accepted_status_ranges)


def _request_destination(logical_url: str, *, mocked: bool):
    """For real traffic, resolve once and connect to the vetted address.

    Preserve the original HTTP Host header and TLS SNI for virtual hosts.
    A MockTransport deliberately avoids real DNS and sockets in unit tests.
    """
    host, port = validate_target_url(logical_url)
    parsed = httpx.URL(logical_url)
    if mocked:
        return parsed, {"Host": parsed.netloc.decode("ascii")}, {}

    ip = resolve_public_ip(host, port)
    return (
        parsed.copy_with(host=ip),
        {"Host": parsed.netloc.decode("ascii")},
        {"sni_hostname": host} if parsed.scheme == "https" else {},
    )


def perform_http_check(monitor: Monitor, *, transport=None) -> HttpCheckOutcome:
    started_at = time.perf_counter()
    logical_url = monitor.url
    error_type = None
    http_status = None
    result = CheckResult.Result.FAILURE

    try:
        with httpx.Client(
            timeout=httpx.Timeout(float(monitor.timeout_seconds)),
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
            transport=transport,
            headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
        ) as client:
            redirects = 0
            while True:
                destination, headers, extensions = _request_destination(
                    logical_url,
                    mocked=transport is not None,
                )
                with client.stream(
                    "GET",
                    destination,
                    headers=headers,
                    extensions=extensions,
                ) as response:
                    http_status = response.status_code
                    location = response.headers.get("Location")

                    if monitor.follow_redirects and http_status in REDIRECT_CODES and location:
                        if redirects >= MAX_REDIRECTS:
                            raise httpx.TooManyRedirects(
                                "Too many redirects.",
                                request=response.request,
                            )
                        next_url = urljoin(logical_url, location)
                        validate_target_url(next_url)
                        logical_url = next_url
                        redirects += 1
                        continue

                    result = (
                        CheckResult.Result.SUCCESS
                        if is_status_accepted(http_status, monitor.accepted_status_ranges)
                        else CheckResult.Result.FAILURE
                    )
                    break
    except UnsafeTarget:
        error_type = CheckResult.ErrorType.UNSAFE_TARGET
        http_status = None
    except socket.gaierror:
        error_type = CheckResult.ErrorType.DNS_ERROR
        http_status = None
    except httpx.RequestError as exc:
        error_type = classify_request_error(exc)
        http_status = None

    return HttpCheckOutcome(
        result=result,
        http_status=http_status,
        response_time_ms=_elapsed_ms(started_at),
        error_type=error_type,
        checked_at=timezone.now(),
    )


@transaction.atomic
def record_check_result(
    monitor: Monitor,
    outcome: HttpCheckOutcome,
    *,
    expected_version: int | None = None,
) -> CheckResult:
    try:
        locked = Monitor.objects.select_for_update().get(pk=monitor.pk)
    except Monitor.DoesNotExist as exc:
        raise MonitorCheckObsolete("Monitor was deleted.") from exc

    if expected_version is not None:
        if not locked.enabled or locked.config_version != expected_version:
            raise MonitorCheckObsolete("Monitor configuration changed during check.")
        if locked.last_checked_at and outcome.checked_at <= locked.last_checked_at:
            raise MonitorCheckObsolete("A newer result is already recorded.")

    check_result = CheckResult.objects.create(
        monitor=locked,
        result=outcome.result,
        http_status=outcome.http_status,
        response_time_ms=outcome.response_time_ms,
        error_type=outcome.error_type,
        checked_at=outcome.checked_at,
    )
    update_daily_metric(locked, check_result)
    apply_check_result_state(locked, check_result)

    monitor.status = locked.status
    monitor.consecutive_failures = locked.consecutive_failures
    monitor.consecutive_successes = locked.consecutive_successes
    monitor.last_checked_at = locked.last_checked_at
    return check_result


def execute_monitor_check(monitor: Monitor, *, transport=None) -> CheckResult:
    if not monitor.enabled:
        raise MonitorCheckDisabled

    expected_version = monitor.config_version
    outcome = perform_http_check(monitor, transport=transport)
    return record_check_result(monitor, outcome, expected_version=expected_version)
