from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import DailyMetric, Incident, Monitor, PublicStatusPage
from users.models import User


@pytest.mark.django_db
def test_public_page_queries_do_not_grow_per_monitor():
    owner = User.objects.create_user(email="query-owner@example.com", password="Rugged-Pulse-2026!")
    page = PublicStatusPage.objects.create(owner=owner, slug="loadtest", enabled=True)
    today = timezone.localdate()
    for index in range(12):
        monitor = Monitor.objects.create(
            owner=owner,
            name=f"Service {index}",
            url=f"https://service{index}.example.com",
            status=Monitor.Status.UP,
        )
        page.monitors.add(monitor)
        DailyMetric.objects.create(
            monitor=monitor,
            date=today,
            total_checks=1,
            successful_checks=1,
            total_response_time_ms=12,
        )
        if index == 0:
            Incident.objects.create(
                monitor=monitor,
                started_at=timezone.now() - timedelta(minutes=5),
                resolved_at=timezone.now(),
            )

    with CaptureQueriesContext(connection) as queries:
        response = APIClient().get("/api/public/status/loadtest/")

    assert response.status_code == 200
    assert len(response.data["monitors"]) == 12
    assert response.data["monitors"][0]["uptime_30d"] is not None
    assert len(queries) <= 7
