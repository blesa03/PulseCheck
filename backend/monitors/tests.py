import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from monitors.models import Monitor
from users.models import User

PASSWORD = "Rugged-Pulse-2026!"


def monitor_payload(**overrides):
    payload = {
        "name": "Example",
        "url": "https://example.com",
        "interval_seconds": 60,
        "timeout_seconds": 10,
        "failure_threshold": 2,
        "recovery_threshold": 1,
        "retention_policy": "30_DAYS",
        "follow_redirects": True,
        "accepted_status_ranges": [
            {
                "min": 200,
                "max": 399,
            }
        ],
    }

    payload.update(overrides)

    return payload


@pytest.fixture
def user():
    return User.objects.create_user(
        email="owner@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def other_user():
    return User.objects.create_user(
        email="other@example.com",
        password=PASSWORD,
    )


@pytest.fixture
def client(user):
    client = APIClient()

    client.force_authenticate(
        user=user,
    )

    return client


@pytest.mark.django_db
def test_monitor_list_requires_authentication():
    client = APIClient()

    response = client.get(
        "/api/monitors/",
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_monitor_assigns_owner_and_defaults(
    client,
    user,
):
    response = client.post(
        "/api/monitors/",
        monitor_payload(),
        format="json",
    )

    assert response.status_code == 201

    monitor = Monitor.objects.get()

    assert monitor.owner == user
    assert monitor.status is None
    assert monitor.enabled is True
    assert monitor.next_check_at is not None

    assert response.data["status"] is None
    assert response.data["enabled"] is True


@pytest.mark.django_db
def test_list_only_returns_owned_monitors(
    client,
    user,
    other_user,
):
    Monitor.objects.create(
        owner=user,
        name="Mine",
        url="https://mine.example.com",
    )

    Monitor.objects.create(
        owner=other_user,
        name="Not mine",
        url="https://other.example.com",
    )

    response = client.get(
        "/api/monitors/",
    )

    assert response.status_code == 200
    assert len(response.data) == 1

    assert response.data[0]["name"] == "Mine"


@pytest.mark.django_db
def test_other_user_monitor_is_not_accessible(
    client,
    other_user,
):
    monitor = Monitor.objects.create(
        owner=other_user,
        name="Private",
        url="https://private.example.com",
    )

    detail_url = f"/api/monitors/{monitor.pk}/"

    get_response = client.get(
        detail_url,
    )

    patch_response = client.patch(
        detail_url,
        {
            "name": "Hijacked",
        },
        format="json",
    )

    delete_response = client.delete(
        detail_url,
    )

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert delete_response.status_code == 404

    monitor.refresh_from_db()

    assert monitor.name == "Private"


@pytest.mark.django_db
def test_monitor_configuration_is_validated(
    client,
):
    response = client.post(
        "/api/monitors/",
        monitor_payload(
            url="ftp://example.com",
            interval_seconds=29,
            timeout_seconds=31,
            failure_threshold=0,
            recovery_threshold=6,
            retention_policy="90_DAYS",
        ),
        format="json",
    )

    assert response.status_code == 400

    assert "url" in response.data
    assert "interval_seconds" in response.data
    assert "timeout_seconds" in response.data
    assert "failure_threshold" in response.data
    assert "recovery_threshold" in response.data
    assert "retention_policy" in response.data


@pytest.mark.django_db
def test_status_semantics_accept_custom_ranges_and_reject_overlap(
    client,
):
    invalid_response = client.post(
        "/api/monitors/",
        monitor_payload(
            accepted_status_ranges=[
                {
                    "min": 200,
                    "max": 299,
                },
                {
                    "min": 250,
                    "max": 399,
                },
            ],
        ),
        format="json",
    )

    assert invalid_response.status_code == 400

    assert "accepted_status_ranges" in invalid_response.data

    valid_response = client.post(
        "/api/monitors/",
        monitor_payload(
            name="Custom semantics",
            accepted_status_ranges=[
                {
                    "min": 200,
                    "max": 204,
                },
                {
                    "min": 404,
                    "max": 404,
                },
            ],
        ),
        format="json",
    )

    assert valid_response.status_code == 201

    assert valid_response.data["accepted_status_ranges"] == [
        {
            "min": 200,
            "max": 204,
        },
        {
            "min": 404,
            "max": 404,
        },
    ]


@pytest.mark.django_db
def test_pause_and_resume_monitor(
    client,
    user,
):
    monitor = Monitor.objects.create(
        owner=user,
        name="Pause me",
        url="https://example.com",
        status=Monitor.Status.UP,
        consecutive_failures=1,
    )

    pause_response = client.post(
        f"/api/monitors/{monitor.pk}/pause/",
    )

    assert pause_response.status_code == 200
    assert pause_response.data["enabled"] is False
    assert pause_response.data["status"] == "PAUSED"
    assert pause_response.data["next_check_at"] is None

    resume_response = client.post(
        f"/api/monitors/{monitor.pk}/resume/",
    )

    assert resume_response.status_code == 200
    assert resume_response.data["enabled"] is True
    assert resume_response.data["status"] is None

    assert resume_response.data["next_check_at"] is not None

    monitor.refresh_from_db()

    assert monitor.consecutive_failures == 0
    assert monitor.consecutive_successes == 0


@pytest.mark.django_db
def test_changing_url_resets_operational_state(
    client,
    user,
):
    monitor = Monitor.objects.create(
        owner=user,
        name="API",
        url="https://old.example.com",
        status=Monitor.Status.UP,
        consecutive_successes=4,
        last_checked_at=timezone.now(),
    )

    response = client.patch(
        f"/api/monitors/{monitor.pk}/",
        {
            "url": "https://new.example.com",
        },
        format="json",
    )

    assert response.status_code == 200

    assert response.data["status"] is None
    assert response.data["consecutive_successes"] == 0
    assert response.data["consecutive_failures"] == 0
    assert response.data["last_checked_at"] is None

    assert response.data["next_check_at"] is not None
