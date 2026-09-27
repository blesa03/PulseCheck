from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import (
    CheckResult,
    Incident,
    Monitor,
)
from monitors.services.checks import (
    HttpCheckOutcome,
    record_check_result,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="states@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other-states@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    **overrides,
):
    values = {
        "owner": user,
        "name": "State machine",
        "url": "https://example.com",
        "failure_threshold": 2,
        "recovery_threshold": 1,
    }

    values.update(overrides)

    return Monitor.objects.create(
        **values,
    )


def record_result(
    monitor,
    result,
    *,
    checked_at=None,
):
    success = result == CheckResult.Result.SUCCESS

    outcome = HttpCheckOutcome(
        result=result,
        http_status=(200 if success else 503),
        response_time_ms=25,
        error_type=None,
        checked_at=(checked_at or timezone.now()),
    )

    return record_check_result(
        monitor,
        outcome,
    )


@pytest.mark.django_db
def test_first_success_sets_monitor_up(
    user,
):
    monitor = create_monitor(
        user,
        recovery_threshold=5,
    )

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.UP)

    assert monitor.consecutive_successes == 1

    assert monitor.consecutive_failures == 0

    assert Incident.objects.count() == 0


@pytest.mark.django_db
def test_failure_threshold_moves_monitor_to_down_and_opens_incident(
    user,
):
    monitor = create_monitor(
        user,
        failure_threshold=2,
    )

    started_at = timezone.now()

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
        checked_at=started_at,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.DEGRADED)

    assert monitor.consecutive_failures == 1
    assert Incident.objects.count() == 0

    confirmed_at = started_at + timedelta(seconds=5)

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
        checked_at=confirmed_at,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.DOWN)

    assert monitor.consecutive_failures == 2

    incident = Incident.objects.get(
        monitor=monitor,
    )

    assert incident.started_at == (confirmed_at)

    assert incident.resolved_at is None


@pytest.mark.django_db
def test_continued_failure_does_not_duplicate_open_incident(
    user,
):
    monitor = create_monitor(
        user,
        failure_threshold=1,
    )

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
    )

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
    )

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.DOWN)

    assert (
        Incident.objects.filter(
            monitor=monitor,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_default_recovery_resolves_incident_after_one_success(
    user,
):
    monitor = create_monitor(
        user,
        failure_threshold=1,
        recovery_threshold=1,
    )

    down_at = timezone.now()

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
        checked_at=down_at,
    )

    recovered_at = down_at + timedelta(seconds=10)

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
        checked_at=recovered_at,
    )

    monitor.refresh_from_db()

    incident = Incident.objects.get(
        monitor=monitor,
    )

    assert monitor.status == (Monitor.Status.UP)

    assert monitor.consecutive_failures == 0
    assert monitor.consecutive_successes == 1

    assert incident.resolved_at == (recovered_at)

    assert incident.duration_seconds == 10


@pytest.mark.django_db
def test_recovery_threshold_uses_degraded_as_transitional_state(
    user,
):
    monitor = create_monitor(
        user,
        failure_threshold=1,
        recovery_threshold=2,
    )

    down_at = timezone.now()

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
        checked_at=down_at,
    )

    first_recovery = down_at + timedelta(seconds=10)

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
        checked_at=first_recovery,
    )

    monitor.refresh_from_db()

    incident = Incident.objects.get(
        monitor=monitor,
    )

    assert monitor.status == (Monitor.Status.DEGRADED)

    assert monitor.consecutive_successes == 1
    assert incident.resolved_at is None

    confirmed_recovery = first_recovery + timedelta(seconds=10)

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
        checked_at=confirmed_recovery,
    )

    monitor.refresh_from_db()
    incident.refresh_from_db()

    assert monitor.status == (Monitor.Status.UP)

    assert monitor.consecutive_successes == 2

    assert incident.resolved_at == (confirmed_recovery)


@pytest.mark.django_db
def test_transient_failure_recovers_without_incident(
    user,
):
    monitor = create_monitor(
        user,
        failure_threshold=3,
        recovery_threshold=3,
        status=Monitor.Status.UP,
    )

    record_result(
        monitor,
        CheckResult.Result.FAILURE,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.DEGRADED)

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.UP)

    assert Incident.objects.count() == 0


@pytest.mark.django_db
def test_paused_monitor_state_is_not_overwritten_by_late_result(
    user,
):
    monitor = create_monitor(
        user,
        enabled=False,
        status=Monitor.Status.PAUSED,
        next_check_at=None,
    )

    record_result(
        monitor,
        CheckResult.Result.SUCCESS,
    )

    monitor.refresh_from_db()

    assert monitor.status == (Monitor.Status.PAUSED)

    assert monitor.consecutive_successes == 0
    assert monitor.consecutive_failures == 0


@pytest.mark.django_db
def test_incident_history_is_owner_scoped(
    user,
    other_user,
):
    monitor = create_monitor(
        user,
    )

    other_monitor = create_monitor(
        other_user,
        name="Other monitor",
    )

    Incident.objects.create(
        monitor=monitor,
    )

    Incident.objects.create(
        monitor=other_monitor,
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    own_response = client.get(
        f"/api/monitors/{monitor.pk}/incidents/",
    )

    foreign_response = client.get(
        (f"/api/monitors/{other_monitor.pk}/incidents/"),
    )

    assert own_response.status_code == 200
    assert len(own_response.data) == 1

    assert own_response.data[0]["monitor"] == monitor.pk

    assert foreign_response.status_code == 404
