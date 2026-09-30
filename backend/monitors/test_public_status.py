import pytest
from rest_framework.test import (
    APIClient,
)

from monitors.models import (
    CheckResult,
    Monitor,
    PublicStatusPage,
)
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def user():
    return User.objects.create_user(
        email="status@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other-status@example.com",
        password=PASSWORD,
    )


def create_monitor(
    user,
    *,
    name="Public API",
    status=Monitor.Status.UP,
):
    monitor = Monitor.objects.create(
        owner=user,
        name=name,
        url="https://example.com",
        status=status,
    )

    return monitor


@pytest.mark.django_db
def test_status_page_config_is_created_for_owner(
    user,
):
    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    response = client.get(
        "/api/status-page/",
    )

    assert response.status_code == 200

    assert response.data["enabled"] is False

    assert response.data["title"] == "Service status"

    assert (
        PublicStatusPage.objects.filter(
            owner=user,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_status_page_can_select_owned_monitors(
    user,
):
    monitor = create_monitor(
        user,
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    client.get(
        "/api/status-page/",
    )

    response = client.patch(
        "/api/status-page/",
        {
            "title": "Acme status",
            "slug": "acme-status",
            "enabled": True,
            "monitor_ids": [
                monitor.pk,
            ],
        },
        format="json",
    )

    assert response.status_code == 200

    assert response.data["slug"] == "acme-status"

    assert response.data["monitor_ids"] == [
        monitor.pk,
    ]


@pytest.mark.django_db
def test_status_page_rejects_foreign_monitor(
    user,
    other_user,
):
    foreign_monitor = create_monitor(
        other_user,
    )

    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    client.get(
        "/api/status-page/",
    )

    response = client.patch(
        "/api/status-page/",
        {
            "monitor_ids": [
                foreign_monitor.pk,
            ],
        },
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_disabled_status_page_is_not_public(
    user,
):
    page = PublicStatusPage.objects.create(
        owner=user,
        slug="private-status",
        enabled=False,
    )

    client = APIClient()

    response = client.get((f"/api/public/status/{page.slug}/"))

    assert response.status_code == 404


@pytest.mark.django_db
def test_public_status_exposes_safe_monitor_data(
    user,
):
    monitor = create_monitor(
        user,
        name="Production API",
    )

    CheckResult.objects.create(
        monitor=monitor,
        result=(CheckResult.Result.SUCCESS),
        http_status=200,
        response_time_ms=80,
    )

    page = PublicStatusPage.objects.create(
        owner=user,
        slug="acme",
        title="Acme Status",
        description=("Availability of Acme services."),
        enabled=True,
    )

    page.monitors.add(
        monitor,
    )

    client = APIClient()

    response = client.get(
        "/api/public/status/acme/",
    )

    assert response.status_code == 200

    assert response.data["title"] == "Acme Status"

    assert response.data["overall_status"] == "UP"

    assert len(response.data["monitors"]) == 1

    public_monitor = response.data["monitors"][0]

    assert public_monitor["name"] == "Production API"

    assert public_monitor["status"] == "UP"

    assert "url" not in public_monitor

    assert "timeout_seconds" not in public_monitor

    assert "failure_threshold" not in public_monitor


@pytest.mark.django_db
def test_public_overall_status_reflects_down_monitor(
    user,
):
    up_monitor = create_monitor(
        user,
        name="Website",
        status=Monitor.Status.UP,
    )

    down_monitor = create_monitor(
        user,
        name="API",
        status=Monitor.Status.DOWN,
    )

    page = PublicStatusPage.objects.create(
        owner=user,
        slug="outage",
        enabled=True,
    )

    page.monitors.add(
        up_monitor,
        down_monitor,
    )

    response = APIClient().get(
        "/api/public/status/outage/",
    )

    assert response.status_code == 200

    assert response.data["overall_status"] == "DOWN"
