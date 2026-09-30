from datetime import timedelta

import pytest
from django.utils import timezone

from monitors.models import (
    CheckResult,
    DailyMetric,
    Monitor,
)
from monitors.services.checks import (
    HttpCheckOutcome,
    record_check_result,
)
from monitors.services.metrics import (
    backfill_missing_daily_metrics,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="metrics@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    **overrides,
):
    values = {
        "owner": user,
        "name": "Metrics monitor",
        "url": "https://example.com",
    }

    values.update(overrides)

    return Monitor.objects.create(
        **values,
    )


def record_result(
    monitor,
    *,
    result,
    response_time_ms,
    checked_at,
):
    return record_check_result(
        monitor,
        HttpCheckOutcome(
            result=result,
            http_status=(200 if result == CheckResult.Result.SUCCESS else 503),
            response_time_ms=(response_time_ms),
            error_type=None,
            checked_at=checked_at,
        ),
    )


@pytest.mark.django_db
def test_checks_increment_daily_metric(
    user,
):
    monitor = create_monitor(user)

    checked_at = timezone.now()

    record_result(
        monitor,
        result=(CheckResult.Result.SUCCESS),
        response_time_ms=100,
        checked_at=checked_at,
    )

    record_result(
        monitor,
        result=(CheckResult.Result.FAILURE),
        response_time_ms=300,
        checked_at=(checked_at + timedelta(minutes=1)),
    )

    metric = DailyMetric.objects.get(
        monitor=monitor,
        date=timezone.localdate(
            checked_at,
        ),
    )

    assert metric.total_checks == 2

    assert metric.successful_checks == 1

    assert metric.failed_checks == 1

    assert metric.total_response_time_ms == 400

    assert metric.min_response_time_ms == 100

    assert metric.max_response_time_ms == 300

    assert metric.average_response_time_ms == 200


@pytest.mark.django_db
def test_checks_on_different_days_create_separate_metrics(
    user,
):
    monitor = create_monitor(user)

    first_day = timezone.now() - timedelta(days=1)

    second_day = timezone.now()

    record_result(
        monitor,
        result=(CheckResult.Result.SUCCESS),
        response_time_ms=50,
        checked_at=first_day,
    )

    record_result(
        monitor,
        result=(CheckResult.Result.SUCCESS),
        response_time_ms=75,
        checked_at=second_day,
    )

    assert (
        DailyMetric.objects.filter(
            monitor=monitor,
        ).count()
        == 2
    )


@pytest.mark.django_db
def test_backfill_creates_metrics_for_existing_raw_checks(
    user,
):
    monitor = create_monitor(user)

    checked_at = timezone.now() - timedelta(days=3)

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=100,
        checked_at=checked_at,
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.FAILURE),
        http_status=500,
        response_time_ms=250,
        checked_at=(checked_at + timedelta(minutes=5)),
    )

    created = backfill_missing_daily_metrics()

    assert created == 1

    metric = DailyMetric.objects.get(
        monitor=monitor,
    )

    assert metric.total_checks == 2
    assert metric.successful_checks == 1
    assert metric.failed_checks == 1

    assert metric.total_response_time_ms == 350

    assert metric.average_response_time_ms == 175

    assert backfill_missing_daily_metrics() == 0

    assert DailyMetric.objects.count() == 1
