from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.conf import settings
from django.utils import timezone

from monitors.models import Monitor
from monitors.tasks import (
    calculate_next_check_at,
    dispatch_due_monitors,
    execute_scheduled_monitor_check,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="scheduler@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    **overrides,
):
    values = {
        "owner": user,
        "name": "Scheduled monitor",
        "url": "https://example.com",
        "interval_seconds": 60,
    }

    values.update(overrides)

    return Monitor.objects.create(
        **values,
    )


def test_next_check_preserves_schedule_cadence():
    now = timezone.now()

    scheduled_for = now - timedelta(
        seconds=95,
    )

    next_check_at = calculate_next_check_at(
        scheduled_for=(scheduled_for),
        interval_seconds=30,
        now=now,
    )

    assert next_check_at == (
        scheduled_for
        + timedelta(
            seconds=120,
        )
    )

    assert next_check_at > now


def test_future_schedule_is_not_changed():
    now = timezone.now()

    scheduled_for = now + timedelta(
        seconds=45,
    )

    assert (
        calculate_next_check_at(
            scheduled_for=scheduled_for,
            interval_seconds=30,
            now=now,
        )
        == scheduled_for
    )


@pytest.mark.django_db
def test_dispatcher_only_claims_due_enabled_monitors(
    user,
    monkeypatch,
):
    now = timezone.now()

    due_monitor = create_monitor(
        user,
        name="Due",
        next_check_at=(now - timedelta(seconds=1)),
    )

    future_monitor = create_monitor(
        user,
        name="Future",
        next_check_at=(now + timedelta(minutes=5)),
    )

    disabled_monitor = create_monitor(
        user,
        name="Disabled",
        enabled=False,
        status=Monitor.Status.PAUSED,
        next_check_at=(now - timedelta(seconds=1)),
    )

    dispatched_ids = []

    monkeypatch.setattr(
        ("monitors.tasks.execute_scheduled_monitor_check.delay"),
        lambda monitor_id: dispatched_ids.append(
            monitor_id,
        ),
    )

    result = dispatch_due_monitors.run()

    due_monitor.refresh_from_db()
    future_monitor.refresh_from_db()
    disabled_monitor.refresh_from_db()

    assert dispatched_ids == [
        due_monitor.pk,
    ]

    assert due_monitor.next_check_at > now

    assert future_monitor.next_check_at > now

    assert disabled_monitor.next_check_at <= now

    assert result == {
        "claimed": 1,
        "dispatched": 1,
        "enqueue_failures": 0,
    }


@pytest.mark.django_db
def test_dispatcher_rearms_monitor_when_enqueue_fails(
    user,
    monkeypatch,
):
    monitor = create_monitor(
        user,
        next_check_at=(timezone.now() - timedelta(seconds=1)),
    )

    def fail_enqueue(
        monitor_id,
    ):
        raise RuntimeError(
            "Broker unavailable.",
        )

    monkeypatch.setattr(
        ("monitors.tasks.execute_scheduled_monitor_check.delay"),
        fail_enqueue,
    )

    result = dispatch_due_monitors.run()

    monitor.refresh_from_db()

    assert monitor.next_check_at <= timezone.now()

    assert result["enqueue_failures"] == 1


@pytest.mark.django_db
def test_scheduled_task_executes_monitor(
    user,
    monkeypatch,
):
    monitor = create_monitor(
        user,
    )

    calls = []

    def fake_check(
        target_monitor,
    ):
        calls.append(
            target_monitor.pk,
        )

        return SimpleNamespace(
            pk=41,
            result="SUCCESS",
        )

    monkeypatch.setattr(
        ("monitors.tasks.execute_monitor_check"),
        fake_check,
    )

    result = execute_scheduled_monitor_check.run(
        monitor.pk,
    )

    assert calls == [
        monitor.pk,
    ]

    assert result == {
        "status": "completed",
        "monitor_id": monitor.pk,
        "check_result_id": 41,
        "result": "SUCCESS",
    }


@pytest.mark.django_db
def test_scheduled_task_skips_paused_monitor(
    user,
    monkeypatch,
):
    monitor = create_monitor(
        user,
        enabled=False,
        status=Monitor.Status.PAUSED,
        next_check_at=None,
    )

    def unexpected_check(
        target_monitor,
    ):
        raise AssertionError(
            "Paused monitor was checked.",
        )

    monkeypatch.setattr(
        ("monitors.tasks.execute_monitor_check"),
        unexpected_check,
    )

    result = execute_scheduled_monitor_check.run(
        monitor.pk,
    )

    assert result == {
        "status": "skipped",
        "reason": "disabled",
        "monitor_id": monitor.pk,
    }


@pytest.mark.django_db
def test_scheduled_task_handles_deleted_monitor():
    result = execute_scheduled_monitor_check.run(
        999999,
    )

    assert result == {
        "status": "missing",
        "monitor_id": 999999,
    }


def test_celery_beat_has_monitor_dispatcher():
    schedule = settings.CELERY_BEAT_SCHEDULE["monitor-dispatcher"]

    assert schedule["task"] == ("monitors.dispatch_due_monitors")

    assert schedule["schedule"] == 30.0
