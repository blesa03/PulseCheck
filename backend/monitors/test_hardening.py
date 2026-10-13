import socket
from datetime import timedelta

import httpx
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import CheckResult, Monitor
from monitors.services.checks import (
    HttpCheckOutcome,
    MonitorCheckObsolete,
    _request_destination,
    execute_monitor_check,
    record_check_result,
)
from monitors.services.target_policy import (
    UnsafeTarget,
    resolve_public_ip,
    validate_target_url,
)
from users.models import User


@pytest.fixture
def owner():
    return User.objects.create_user(email="hardening@example.com", password="Rugged-Pulse-2026!")


def create_monitor(owner, **overrides):
    values = {"owner": owner, "name": "Hardened", "url": "https://example.com"}
    values.update(overrides)
    return Monitor.objects.create(**values)


def outcome(*, checked_at=None):
    return HttpCheckOutcome(
        result=CheckResult.Result.SUCCESS,
        http_status=200,
        response_time_ms=20,
        error_type=None,
        checked_at=checked_at or timezone.now(),
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.10.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://localhost/",
        "http://private.internal/",
        "http://metadata.google.internal/",
        "ftp://example.com/",
        "https://user:password@example.com/",
        "https://example.com/#fragment",
    ],
)
def test_unsafe_targets_are_rejected(url):
    with pytest.raises(UnsafeTarget):
        validate_target_url(url)


def test_valid_target_is_accepted():
    assert validate_target_url("https://example.com:8443/path") == ("example.com", 8443)


def test_dns_answer_must_not_include_private_ips(monkeypatch):
    def fake_resolution(*args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_resolution)
    with pytest.raises(UnsafeTarget):
        resolve_public_ip("example.com", 443)


def test_validated_address_is_pinned_to_request(monkeypatch):
    monkeypatch.setattr("monitors.services.checks.resolve_public_ip", lambda host, port: "1.1.1.1")
    destination, headers, extensions = _request_destination(
        "https://example.com/path", mocked=False
    )
    assert destination.host == "1.1.1.1"
    assert headers == {"Host": "example.com"}
    assert extensions == {"sni_hostname": "example.com"}


@pytest.mark.django_db
def test_serializer_blocks_private_monitor_creation(owner):
    client = APIClient()
    client.force_authenticate(owner)
    result = client.post(
        "/api/monitors/",
        {"name": "Cloud metadata", "url": "http://169.254.169.254/"},
        format="json",
    )
    assert result.status_code == 400
    assert "url" in result.data


@pytest.mark.django_db
def test_redirect_cannot_reach_private_host(owner):
    monitor = create_monitor(owner)

    def redirect(request):
        return httpx.Response(302, headers={"Location": "http://127.0.0.1/admin"})

    check = execute_monitor_check(monitor, transport=httpx.MockTransport(redirect))
    assert check.result == CheckResult.Result.FAILURE
    assert check.error_type == CheckResult.ErrorType.UNSAFE_TARGET


@pytest.mark.django_db
def test_safe_relative_redirect_succeeds(owner):
    monitor = create_monitor(owner)
    paths = []

    def handler(request):
        paths.append(request.url.path)
        if request.url.path == "/":
            return httpx.Response(302, headers={"Location": "/ready"})
        return httpx.Response(200)

    check = execute_monitor_check(monitor, transport=httpx.MockTransport(handler))
    assert check.result == CheckResult.Result.SUCCESS
    assert paths == ["/", "/ready"]


@pytest.mark.django_db
def test_changed_configuration_invalidates_inflight_check(owner):
    monitor = create_monitor(owner)
    version = monitor.config_version
    Monitor.objects.filter(pk=monitor.pk).update(config_version=version + 1)
    with pytest.raises(MonitorCheckObsolete):
        record_check_result(monitor, outcome(), expected_version=version)
    assert not CheckResult.objects.filter(monitor=monitor).exists()


@pytest.mark.django_db
def test_pause_invalidates_inflight_check(owner):
    monitor = create_monitor(owner)
    client = APIClient()
    client.force_authenticate(owner)
    response = client.post(f"/api/monitors/{monitor.pk}/pause/")
    assert response.status_code == 200
    with pytest.raises(MonitorCheckObsolete):
        record_check_result(monitor, outcome(), expected_version=1)
    monitor.refresh_from_db()
    assert monitor.status == Monitor.Status.PAUSED


@pytest.mark.django_db
def test_out_of_order_result_does_not_roll_back_state(owner):
    monitor = create_monitor(owner)
    now = timezone.now()
    record_check_result(monitor, outcome(checked_at=now), expected_version=1)
    with pytest.raises(MonitorCheckObsolete):
        record_check_result(
            monitor,
            outcome(checked_at=now - timedelta(seconds=5)),
            expected_version=1,
        )
    assert CheckResult.objects.filter(monitor=monitor).count() == 1


@pytest.mark.django_db
def test_url_change_increments_version_and_resets_state(owner):
    monitor = create_monitor(owner, status=Monitor.Status.UP)
    client = APIClient()
    client.force_authenticate(owner)
    response = client.patch(
        f"/api/monitors/{monitor.pk}/",
        {"url": "https://new.example.com"},
        format="json",
    )
    assert response.status_code == 200
    monitor.refresh_from_db()
    assert monitor.config_version == 2
    assert monitor.status is None
