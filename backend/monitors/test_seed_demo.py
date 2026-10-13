"""Tests for synthetic data seeding into an existing user account."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import Sum
from django.test import override_settings
from rest_framework.test import APIClient

from monitors.management.commands.seed_demo import (
    DEMO_EMAIL,
    SCENARIOS,
    demo_url,
)
from monitors.models import (
    CheckResult,
    DailyMetric,
    Incident,
    Monitor,
    PublicStatusPage,
)
from monitors.services.analytics import build_monitor_metrics
from users.models import User

pytestmark = pytest.mark.django_db

PASSWORD = "Test-Existing-Account-2026!"


@pytest.fixture
def demo_user(settings):
    settings.DEBUG = True

    return User.objects.create_user(
        email=DEMO_EMAIL,
        password=PASSWORD,
    )


def test_requires_debug_and_existing_account(demo_user):
    with (
        override_settings(DEBUG=False),
        pytest.raises(
            CommandError,
            match="DEBUG=False",
        ),
    ):
        call_command("seed_demo", verbosity=0)

    demo_user.delete()

    with pytest.raises(
        CommandError,
        match="does not exist",
    ):
        call_command("seed_demo", verbosity=0)


def test_generates_consistent_demo_history(demo_user):
    original_id = demo_user.pk
    original_password = demo_user.password

    call_command("seed_demo", verbosity=0)

    demo_user.refresh_from_db()

    assert demo_user.pk == original_id
    assert demo_user.password == original_password
    assert demo_user.check_password(PASSWORD)
    assert User.objects.count() == 1

    monitors = Monitor.objects.filter(
        owner=demo_user,
    )

    assert monitors.count() == len(SCENARIOS)
    assert set(monitors.values_list("status", flat=True)) == {
        Monitor.Status.UP,
        Monitor.Status.DOWN,
        Monitor.Status.DEGRADED,
        Monitor.Status.PAUSED,
        None,
    }

    assert all(monitor.next_check_at is None for monitor in monitors)

    gateway = monitors.get(name="API Gateway")
    billing = monitors.get(name="Billing API")
    notifications = monitors.get(name="Notifications Service")
    pending = monitors.get(name="New Integration")

    assert (
        CheckResult.objects.filter(
            monitor=gateway,
        ).count()
        == 720
    )

    assert (
        DailyMetric.objects.filter(
            monitor=gateway,
        ).count()
        >= 29
    )

    assert gateway.status == Monitor.Status.UP
    assert billing.status == Monitor.Status.DOWN
    assert notifications.status == Monitor.Status.DEGRADED

    assert pending.last_checked_at is None

    assert not CheckResult.objects.filter(
        monitor=pending,
    ).exists()

    for metric in DailyMetric.objects.filter(monitor=gateway):
        checks = CheckResult.objects.filter(
            monitor=gateway,
            checked_at__date=metric.date,
        )

        assert metric.total_checks == checks.count()

        assert (
            metric.successful_checks
            == checks.filter(
                result=CheckResult.Result.SUCCESS,
            ).count()
        )

        assert (
            metric.failed_checks
            == checks.filter(
                result=CheckResult.Result.FAILURE,
            ).count()
        )

        assert metric.total_response_time_ms == (
            checks.aggregate(
                total=Sum("response_time_ms"),
            )["total"]
            or 0
        )

    assert (
        Incident.objects.filter(
            monitor=billing,
            resolved_at__isnull=True,
        ).count()
        == 1
    )

    assert Incident.objects.filter(
        monitor=gateway,
        resolved_at__isnull=False,
    ).exists()

    assert (
        build_monitor_metrics(
            gateway,
            "24h",
        )["checks"]["total"]
        > 0
    )

    assert (
        build_monitor_metrics(
            gateway,
            "30d",
        )["uptime"]["percentage"]
        < 100
    )

    page = PublicStatusPage.objects.get(
        owner=demo_user,
    )

    assert page.enabled
    assert page.slug == "pulsecheck-demo"
    assert page.monitors.count() == 9

    response = APIClient().get("/api/public/status/pulsecheck-demo/")

    assert response.status_code == 200
    assert response.data["overall_status"] == "DOWN"
    assert len(response.data["monitors"]) == 9


def test_reset_preserves_account_and_unrelated_monitors(demo_user):
    other_monitor = Monitor.objects.create(
        owner=demo_user,
        name="Existing Production Monitor",
        url="https://example.com/health",
    )

    original_password = demo_user.password
    original_user_id = demo_user.pk

    call_command("seed_demo", verbosity=0)

    first_demo_ids = set(
        Monitor.objects.filter(
            owner=demo_user,
            url__in=[demo_url(host) for _, host, _, _, _ in SCENARIOS],
        ).values_list("pk", flat=True)
    )

    with pytest.raises(
        CommandError,
        match="already exist",
    ):
        call_command("seed_demo", verbosity=0)

    call_command("seed_demo", reset=True, verbosity=0)

    demo_user.refresh_from_db()

    assert demo_user.pk == original_user_id
    assert demo_user.password == original_password
    assert demo_user.check_password(PASSWORD)

    assert Monitor.objects.filter(
        pk=other_monitor.pk,
        owner=demo_user,
    ).exists()

    replacement_monitors = Monitor.objects.filter(
        owner=demo_user,
        url__in=[demo_url(host) for _, host, _, _, _ in SCENARIOS],
    )

    assert replacement_monitors.count() == 9

    replacement_ids = set(replacement_monitors.values_list("pk", flat=True))

    assert first_demo_ids.isdisjoint(replacement_ids)

    assert (
        Monitor.objects.filter(
            owner=demo_user,
        ).count()
        == 10
    )

    assert (
        User.objects.filter(
            email=DEMO_EMAIL,
        ).count()
        == 1
    )


def test_existing_public_page_is_preserved(demo_user):
    existing_monitor = Monitor.objects.create(
        owner=demo_user,
        name="My Existing Service",
        url="https://example.com",
    )

    page = PublicStatusPage.objects.create(
        owner=demo_user,
        title="My Existing Status",
        description="Original description",
        slug="my-existing-status",
        enabled=False,
    )

    page.monitors.add(existing_monitor)

    call_command("seed_demo", verbosity=0)

    page.refresh_from_db()

    assert page.title == "My Existing Status"
    assert page.description == "Original description"
    assert page.slug == "my-existing-status"
    assert page.enabled is False

    assert page.monitors.filter(
        pk=existing_monitor.pk,
    ).exists()

    assert page.monitors.count() == 10

    call_command("seed_demo", reset=True, verbosity=0)

    page.refresh_from_db()

    assert (
        PublicStatusPage.objects.filter(
            owner=demo_user,
        ).count()
        == 1
    )

    assert page.title == "My Existing Status"
    assert page.slug == "my-existing-status"
    assert page.enabled is False

    assert page.monitors.filter(
        pk=existing_monitor.pk,
    ).exists()

    assert page.monitors.count() == 10


def test_reset_rejects_reserved_url_collision(demo_user):
    Monitor.objects.create(
        owner=demo_user,
        name="Unrelated Monitor",
        url=demo_url("gateway"),
    )

    with pytest.raises(
        CommandError,
        match="reserved demo URL",
    ):
        call_command("seed_demo", reset=True, verbosity=0)

    assert (
        Monitor.objects.filter(
            owner=demo_user,
        ).count()
        == 1
    )


def test_demo_does_not_modify_other_users(demo_user):
    other_user = User.objects.create_user(
        email="other@example.com",
        password="Test-Other-Password-2026!",
    )

    other_monitor = Monitor.objects.create(
        owner=other_user,
        name="Other User Monitor",
        url="https://example.com",
    )

    call_command("seed_demo", verbosity=0)
    call_command("seed_demo", reset=True, verbosity=0)

    assert User.objects.filter(
        pk=other_user.pk,
    ).exists()

    assert Monitor.objects.filter(
        pk=other_monitor.pk,
        owner=other_user,
    ).exists()

    assert User.objects.filter(
        pk=demo_user.pk,
    ).exists()
