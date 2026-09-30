from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import (
    CheckResult,
    Monitor,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="detail@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other-detail@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    *,
    name="Detail monitor",
):
    return Monitor.objects.create(
        owner=user,
        name=name,
        url="https://example.com",
    )


@pytest.mark.django_db
def test_checks_endpoint_returns_latest_results(
    user,
):
    monitor = create_monitor(user)

    now = timezone.now()

    oldest = CheckResult.objects.create(
        monitor=monitor,
        result=CheckResult.Result.SUCCESS,
        http_status=200,
        response_time_ms=100,
        checked_at=(now - timedelta(minutes=2)),
    )

    middle = CheckResult.objects.create(
        monitor=monitor,
        result=CheckResult.Result.FAILURE,
        http_status=503,
        response_time_ms=250,
        checked_at=(now - timedelta(minutes=1)),
    )

    newest = CheckResult.objects.create(
        monitor=monitor,
        result=CheckResult.Result.SUCCESS,
        http_status=200,
        response_time_ms=80,
        checked_at=now,
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    response = client.get((f"/api/monitors/{monitor.pk}/checks/?limit=2"))

    assert response.status_code == 200

    assert len(response.data) == 2

    assert response.data[0]["id"] == (newest.pk)

    assert response.data[1]["id"] == (middle.pk)

    assert all(item["id"] != oldest.pk for item in response.data)


@pytest.mark.django_db
def test_checks_endpoint_is_owner_scoped(
    user,
    other_user,
):
    monitor = create_monitor(
        other_user,
        name="Foreign monitor",
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    response = client.get((f"/api/monitors/{monitor.pk}/checks/"))

    assert response.status_code == 404


@pytest.mark.django_db
def test_checks_endpoint_validates_limit(
    user,
):
    monitor = create_monitor(user)

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    response = client.get((f"/api/monitors/{monitor.pk}/checks/?limit=101"))

    assert response.status_code == 400

    assert "limit" in response.data
