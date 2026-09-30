from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from monitors.models import (
    CheckResult,
    DailyMetric,
    Incident,
    Monitor,
)
from monitors.services.metrics import (
    backfill_missing_daily_metrics,
)
from monitors.services.retention import (
    purge_expired_check_results,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="retention@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    *,
    policy,
):
    return Monitor.objects.create(
        owner=user,
        name=f"Retention {policy}",
        url="https://example.com",
        retention_policy=policy,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    (
        "policy",
        "retention_window",
    ),
    [
        (
            Monitor.RetentionPolicy.HOURS_48,
            timedelta(hours=48),
        ),
        (
            Monitor.RetentionPolicy.DAYS_7,
            timedelta(days=7),
        ),
        (
            Monitor.RetentionPolicy.DAYS_14,
            timedelta(days=14),
        ),
        (
            Monitor.RetentionPolicy.DAYS_30,
            timedelta(days=30),
        ),
    ],
)
def test_retention_removes_only_expired_raw_checks(
    user,
    policy,
    retention_window,
):
    now = timezone.now()

    monitor = create_monitor(
        user,
        policy=policy,
    )

    expired = CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=50,
        checked_at=(now - retention_window - timedelta(seconds=1)),
    )

    retained = CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=60,
        checked_at=(now - retention_window + timedelta(seconds=1)),
    )

    result = purge_expired_check_results(
        now=now,
        batch_size=1,
    )

    assert (
        CheckResult.objects.filter(
            pk=expired.pk,
        ).exists()
        is False
    )

    assert (
        CheckResult.objects.filter(
            pk=retained.pk,
        ).exists()
        is True
    )

    assert result["total_deleted"] == 1


@pytest.mark.django_db
def test_forever_policy_never_purges_raw_checks(
    user,
):
    monitor = create_monitor(
        user,
        policy=(Monitor.RetentionPolicy.FOREVER),
    )

    check_result = CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=50,
        checked_at=(timezone.now() - timedelta(days=3650)),
    )

    result = purge_expired_check_results()

    assert (
        CheckResult.objects.filter(
            pk=check_result.pk,
        ).exists()
        is True
    )

    assert result["total_deleted"] == 0


@pytest.mark.django_db
def test_retention_preserves_daily_metrics_and_incidents(
    user,
):
    now = timezone.now()

    monitor = create_monitor(
        user,
        policy=(Monitor.RetentionPolicy.HOURS_48),
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.FAILURE),
        http_status=503,
        response_time_ms=500,
        checked_at=(now - timedelta(days=3)),
    )

    backfill_missing_daily_metrics()

    incident = Incident.objects.create(
        monitor=monitor,
        started_at=(now - timedelta(days=3)),
        resolved_at=(
            now
            - timedelta(
                days=2,
                hours=23,
            )
        ),
    )

    assert (
        DailyMetric.objects.filter(
            monitor=monitor,
        ).count()
        == 1
    )

    purge_expired_check_results(
        now=now,
        batch_size=1,
    )

    assert (
        CheckResult.objects.filter(
            monitor=monitor,
        ).count()
        == 0
    )

    assert (
        DailyMetric.objects.filter(
            monitor=monitor,
        ).count()
        == 1
    )

    assert (
        Incident.objects.filter(
            pk=incident.pk,
        ).exists()
        is True
    )


def test_retention_task_is_registered_with_beat():
    schedule = settings.CELERY_BEAT_SCHEDULE["check-result-retention"]

    assert schedule["task"] == ("monitors.purge_expired_check_results")
