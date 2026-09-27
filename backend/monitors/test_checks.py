import socket
import ssl

import httpx
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import (
    CheckResult,
    Monitor,
)
from monitors.services.checks import (
    execute_monitor_check,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


class NeverReadStream(
    httpx.SyncByteStream,
):
    def __iter__(self):
        raise AssertionError("Response body must not be read.")

    def close(self):
        pass


def create_monitor(
    user,
    **overrides,
):
    values = {
        "owner": user,
        "name": "Example",
        "url": "https://example.com",
        "timeout_seconds": 10,
        "follow_redirects": True,
        "accepted_status_ranges": [
            {
                "min": 200,
                "max": 399,
            }
        ],
    }

    values.update(overrides)

    return Monitor.objects.create(
        **values,
    )


@pytest.fixture
def user():
    return User.objects.create_user(
        email="checks@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other-checks@example.com",
        password=PASSWORD,
    )


@pytest.mark.django_db
def test_successful_check_is_persisted_without_reading_body(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        return httpx.Response(
            200,
            stream=NeverReadStream(),
        )

    transport = httpx.MockTransport(
        handler,
    )

    check_result = execute_monitor_check(
        monitor,
        transport=transport,
    )

    assert check_result.result == (CheckResult.Result.SUCCESS)

    assert check_result.http_status == 200
    assert check_result.error_type is None

    assert check_result.response_time_ms >= 0

    monitor.refresh_from_db()

    assert monitor.last_checked_at == (check_result.checked_at)

    assert (
        CheckResult.objects.filter(
            monitor=monitor,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_unaccepted_http_status_is_failure(
    user,
):
    monitor = create_monitor(
        user,
        accepted_status_ranges=[
            {
                "min": 200,
                "max": 299,
            }
        ],
    )

    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            503,
        ),
    )

    check_result = execute_monitor_check(
        monitor,
        transport=transport,
    )

    assert check_result.result == (CheckResult.Result.FAILURE)

    assert check_result.http_status == 503
    assert check_result.error_type is None


@pytest.mark.django_db
def test_custom_http_status_can_be_success(
    user,
):
    monitor = create_monitor(
        user,
        accepted_status_ranges=[
            {
                "min": 404,
                "max": 404,
            }
        ],
    )

    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            404,
        ),
    )

    check_result = execute_monitor_check(
        monitor,
        transport=transport,
    )

    assert check_result.result == (CheckResult.Result.SUCCESS)

    assert check_result.http_status == 404


@pytest.mark.django_db
def test_timeout_is_classified(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        raise httpx.ReadTimeout(
            "Timed out.",
            request=request,
        )

    check_result = execute_monitor_check(
        monitor,
        transport=httpx.MockTransport(
            handler,
        ),
    )

    assert check_result.result == (CheckResult.Result.FAILURE)

    assert check_result.http_status is None

    assert check_result.error_type == (CheckResult.ErrorType.TIMEOUT)


@pytest.mark.django_db
def test_dns_error_is_classified(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        try:
            raise socket.gaierror(
                socket.EAI_NONAME,
                "Name or service not known",
            )
        except socket.gaierror as exc:
            raise httpx.ConnectError(
                "DNS failed.",
                request=request,
            ) from exc

    check_result = execute_monitor_check(
        monitor,
        transport=httpx.MockTransport(
            handler,
        ),
    )

    assert check_result.error_type == (CheckResult.ErrorType.DNS_ERROR)


@pytest.mark.django_db
def test_ssl_error_is_classified(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        try:
            raise ssl.SSLError("certificate verify failed")
        except ssl.SSLError as exc:
            raise httpx.ConnectError(
                "TLS failed.",
                request=request,
            ) from exc

    check_result = execute_monitor_check(
        monitor,
        transport=httpx.MockTransport(
            handler,
        ),
    )

    assert check_result.error_type == (CheckResult.ErrorType.SSL_ERROR)


@pytest.mark.django_db
def test_connection_error_is_classified(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        raise httpx.ConnectError(
            "Connection refused.",
            request=request,
        )

    check_result = execute_monitor_check(
        monitor,
        transport=httpx.MockTransport(
            handler,
        ),
    )

    assert check_result.error_type == (CheckResult.ErrorType.CONNECTION_ERROR)


@pytest.mark.django_db
def test_too_many_redirects_is_classified(
    user,
):
    monitor = create_monitor(user)

    def handler(request):
        return httpx.Response(
            302,
            headers={
                "Location": str(
                    request.url,
                ),
            },
        )

    check_result = execute_monitor_check(
        monitor,
        transport=httpx.MockTransport(
            handler,
        ),
    )

    assert check_result.result == (CheckResult.Result.FAILURE)

    assert check_result.error_type == (CheckResult.ErrorType.TOO_MANY_REDIRECTS)


@pytest.mark.django_db
def test_check_now_endpoint_executes_owned_monitor(
    user,
    monkeypatch,
):
    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    monitor = create_monitor(user)

    def fake_execute(
        target_monitor,
    ):
        assert target_monitor == monitor

        return CheckResult.objects.create(
            monitor=target_monitor,
            result=(CheckResult.Result.SUCCESS),
            http_status=200,
            response_time_ms=42,
            checked_at=timezone.now(),
        )

    monkeypatch.setattr(
        "monitors.views.execute_monitor_check",
        fake_execute,
    )

    response = client.post(
        f"/api/monitors/{monitor.pk}/check/",
    )

    assert response.status_code == 201

    assert response.data["check_result"]["result"] == "SUCCESS"

    assert response.data["check_result"]["http_status"] == 200

    assert response.data["check_result"]["response_time_ms"] == 42

    assert response.data["monitor"]["id"] == monitor.pk


@pytest.mark.django_db
def test_paused_monitor_cannot_be_checked(
    user,
):
    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    monitor = create_monitor(
        user,
        enabled=False,
        status=Monitor.Status.PAUSED,
        next_check_at=None,
    )

    response = client.post(
        f"/api/monitors/{monitor.pk}/check/",
    )

    assert response.status_code == 409

    assert (
        CheckResult.objects.filter(
            monitor=monitor,
        ).exists()
        is False
    )


@pytest.mark.django_db
def test_check_now_cannot_access_foreign_monitor(
    user,
    other_user,
):
    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    monitor = create_monitor(
        other_user,
    )

    response = client.post(
        f"/api/monitors/{monitor.pk}/check/",
    )

    assert response.status_code == 404

    assert (
        CheckResult.objects.filter(
            monitor=monitor,
        ).exists()
        is False
    )
