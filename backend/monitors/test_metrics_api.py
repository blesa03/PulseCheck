from datetime import UTC, datetime, timedelta

import pytest
from rest_framework.test import APIClient

from monitors.models import (
    CheckResult,
    DailyMetric,
    Incident,
    Monitor,
)
from monitors.services.analytics import (
    build_monitor_metrics,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="metrics-api@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other-metrics@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    *,
    created_at,
    name="Metrics monitor",
):
    monitor = Monitor.objects.create(
        owner=user,
        name=name,
        url="https://example.com",
    )

    Monitor.objects.filter(
        pk=monitor.pk,
    ).update(
        created_at=created_at,
    )

    monitor.refresh_from_db()

    return monitor


@pytest.mark.django_db
def test_uptime_uses_incident_time_not_check_success_ratio(
    user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(days=2)),
    )

    Incident.objects.create(
        monitor=monitor,
        started_at=(now - timedelta(hours=6)),
        resolved_at=(now - timedelta(hours=4)),
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=100,
        checked_at=(now - timedelta(hours=3)),
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.FAILURE),
        http_status=503,
        response_time_ms=300,
        checked_at=(now - timedelta(hours=2)),
    )

    metrics = build_monitor_metrics(
        monitor,
        "24h",
        now=now,
    )

    assert metrics["uptime"]["window_seconds"] == 86400

    assert metrics["uptime"]["downtime_seconds"] == 7200

    assert metrics["uptime"]["percentage"] == 91.6667

    assert metrics["checks"]["total"] == 2

    assert metrics["checks"]["successful"] == 1

    assert metrics["checks"]["failed"] == 1

    assert metrics["checks"]["success_percentage"] == 50.0

    assert metrics["latency"]["average_ms"] == 200.0

    assert metrics["latency"]["min_ms"] == 100

    assert metrics["latency"]["max_ms"] == 300


@pytest.mark.django_db
def test_open_incident_is_clipped_at_period_end(
    user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(days=2)),
    )

    Incident.objects.create(
        monitor=monitor,
        started_at=(now - timedelta(minutes=90)),
    )

    metrics = build_monitor_metrics(
        monitor,
        "24h",
        now=now,
    )

    assert metrics["uptime"]["downtime_seconds"] == 5400

    assert metrics["incidents"]["count"] == 1

    assert metrics["incidents"]["open_count"] == 1


@pytest.mark.django_db
def test_24h_metrics_exclude_older_raw_checks(
    user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(days=3)),
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=900,
        checked_at=(now - timedelta(hours=25)),
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=100,
        checked_at=(now - timedelta(hours=5)),
    )

    metrics = build_monitor_metrics(
        monitor,
        "24h",
        now=now,
    )

    assert metrics["checks"]["total"] == 1

    assert metrics["latency"]["average_ms"] == 100.0


@pytest.mark.django_db
def test_7d_metrics_use_permanent_daily_aggregates(
    user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(days=20)),
    )

    DailyMetric.objects.create(
        monitor=monitor,
        date=(now - timedelta(days=6)).date(),
        total_checks=10,
        successful_checks=9,
        failed_checks=1,
        total_response_time_ms=1000,
        min_response_time_ms=50,
        max_response_time_ms=200,
    )

    DailyMetric.objects.create(
        monitor=monitor,
        date=now.date(),
        total_checks=2,
        successful_checks=2,
        failed_checks=0,
        total_response_time_ms=200,
        min_response_time_ms=90,
        max_response_time_ms=110,
    )

    metrics = build_monitor_metrics(
        monitor,
        "7d",
        now=now,
    )

    assert metrics["checks"]["total"] == 12

    assert metrics["checks"]["successful"] == 11

    assert metrics["checks"]["failed"] == 1

    assert metrics["checks"]["success_percentage"] == 91.6667

    assert metrics["latency"]["average_ms"] == 100.0

    assert metrics["latency"]["min_ms"] == 50

    assert metrics["latency"]["max_ms"] == 200

    assert len(metrics["daily"]) == 2

    assert metrics["uptime"]["percentage"] == 100.0


@pytest.mark.django_db
def test_metrics_window_is_clipped_to_monitor_creation(
    user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(hours=6)),
    )

    metrics = build_monitor_metrics(
        monitor,
        "24h",
        now=now,
    )

    assert metrics["uptime"]["window_seconds"] == 21600

    assert metrics["uptime"]["percentage"] == 100.0


@pytest.mark.django_db
def test_metrics_endpoint_defaults_to_24h_and_is_owner_scoped(
    user,
    other_user,
):
    now = datetime(
        2026,
        9,
        30,
        12,
        0,
        tzinfo=UTC,
    )

    monitor = create_monitor(
        user,
        created_at=(now - timedelta(days=2)),
    )

    foreign_monitor = create_monitor(
        other_user,
        created_at=(now - timedelta(days=2)),
        name="Foreign monitor",
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    own_response = client.get((f"/api/monitors/{monitor.pk}/metrics/"))

    foreign_response = client.get((f"/api/monitors/{foreign_monitor.pk}/metrics/"))

    assert own_response.status_code == 200

    assert own_response.data["period"] == "24h"

    assert own_response.data["monitor_id"] == monitor.pk

    assert foreign_response.status_code == 404


@pytest.mark.django_db
def test_metrics_endpoint_rejects_invalid_period(
    user,
):
    monitor = Monitor.objects.create(
        owner=user,
        name="Invalid period",
        url="https://example.com",
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    response = client.get((f"/api/monitors/{monitor.pk}/metrics/?period=banana"))

    assert response.status_code == 400

    assert "period" in response.data
