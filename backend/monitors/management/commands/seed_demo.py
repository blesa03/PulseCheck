"""Generate synthetic monitoring history for an existing portfolio account."""

import random
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from monitors.models import (
    CheckResult,
    DailyMetric,
    Incident,
    Monitor,
    PublicStatusPage,
)
from users.models import User

DEMO_EMAIL = "pulsecheck@gmail.com"
DEMO_SLUG = "pulsecheck-demo"
HOURS = 30 * 24

SCENARIOS = (
    ("API Gateway", "gateway", 83, "up", ((65, 69), (421, 424))),
    ("Web Application", "web", 124, "up", ()),
    ("Authentication Service", "auth", 107, "up", ((172, 176),)),
    ("Billing API", "billing", 189, "down", ()),
    ("Notifications Service", "notifications", 145, "degraded", ()),
    ("Search Service", "search", 221, "up", ((290, 293),)),
    ("Analytics API", "analytics", 310, "up", ((513, 518),)),
    ("Administration Portal", "admin", 159, "paused", ()),
    ("New Integration", "new", 115, "pending", ()),
)


def demo_url(host):
    return f"https://{host}.pulsecheck.example/health"


def find_demo_monitors(owner):
    """Identify generated monitors without touching unrelated records."""
    expected = {demo_url(host): name for name, host, _, _, _ in SCENARIOS}

    monitors = list(
        Monitor.objects.filter(
            owner=owner,
            url__in=expected,
        ).order_by("id")
    )

    for monitor in monitors:
        if monitor.name != expected[monitor.url]:
            raise CommandError(
                "A monitor already uses a reserved demo URL "
                "but does not match the expected demo fixture. "
                "No data was modified."
            )

    return monitors


def build_history(
    monitor,
    *,
    now,
    base_latency,
    scenario,
    windows,
    seed,
):
    """Generate checks, incidents and daily aggregates consistently."""
    rng = random.Random(seed)

    results = []
    incidents = []
    daily = defaultdict(
        lambda: {
            "total": 0,
            "success": 0,
            "sum_ms": 0,
            "min": None,
            "max": None,
        }
    )

    status = None
    failures = 0
    recoveries = 0
    open_incident = None
    last_checked = None

    if scenario == "pending":
        return (
            results,
            incidents,
            [],
            status,
            failures,
            recoveries,
            last_checked,
        )

    for offset in range(HOURS - 1, -1, -1):
        if scenario == "paused" and offset < 48:
            continue

        checked_at = now - timedelta(
            hours=offset,
            minutes=5,
        )

        failed = (
            any(low <= offset <= high for low, high in windows)
            or (scenario == "down" and offset <= 5)
            or (scenario == "degraded" and offset == 0)
        )

        timeout = failed and offset % 3 == 0
        latency = max(
            15,
            base_latency + rng.randint(-24, 46),
        )

        if timeout:
            latency = monitor.timeout_seconds * 1000

        result = CheckResult.Result.FAILURE if failed else CheckResult.Result.SUCCESS

        results.append(
            CheckResult(
                monitor=monitor,
                checked_at=checked_at,
                result=result,
                http_status=None if timeout else (503 if failed else 200),
                error_type=(CheckResult.ErrorType.TIMEOUT if timeout else None),
                response_time_ms=latency,
            )
        )

        row = daily[timezone.localdate(checked_at)]
        row["total"] += 1
        row["success"] += int(not failed)
        row["sum_ms"] += latency

        row["min"] = latency if row["min"] is None else min(row["min"], latency)
        row["max"] = latency if row["max"] is None else max(row["max"], latency)

        last_checked = checked_at

        if failed:
            failures += 1
            recoveries = 0

            if open_incident is not None:
                status = Monitor.Status.DOWN
            elif failures >= monitor.failure_threshold:
                open_incident = Incident(
                    monitor=monitor,
                    started_at=checked_at,
                )
                incidents.append(open_incident)
                status = Monitor.Status.DOWN
            else:
                status = Monitor.Status.DEGRADED

        else:
            failures = 0
            recoveries += 1

            if open_incident is None:
                status = Monitor.Status.UP
            elif recoveries >= monitor.recovery_threshold:
                open_incident.resolved_at = checked_at
                open_incident = None
                status = Monitor.Status.UP
            else:
                status = Monitor.Status.DEGRADED

    daily_rows = [
        DailyMetric(
            monitor=monitor,
            date=date,
            total_checks=values["total"],
            successful_checks=values["success"],
            failed_checks=values["total"] - values["success"],
            total_response_time_ms=values["sum_ms"],
            min_response_time_ms=values["min"],
            max_response_time_ms=values["max"],
        )
        for date, values in sorted(daily.items())
    ]

    if scenario == "paused":
        status = Monitor.Status.PAUSED
        failures = 0
        recoveries = 0

    return (
        results,
        incidents,
        daily_rows,
        status,
        failures,
        recoveries,
        last_checked,
    )


class Command(BaseCommand):
    help = "Seed synthetic monitoring data for pulsecheck@gmail.com."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Regenerate only recognized synthetic monitors.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo seeding is disabled when DEBUG=False.")

        with transaction.atomic():
            user = User.objects.filter(
                email__iexact=DEMO_EMAIL,
            ).first()

            if user is None:
                raise CommandError(
                    f"Account {DEMO_EMAIL} does not exist. "
                    "Create or verify the account before seeding."
                )

            existing = find_demo_monitors(user)

            if existing and not options["reset"]:
                raise CommandError("Demo monitors already exist. Use --reset to regenerate them.")

            if existing:
                Monitor.objects.filter(
                    pk__in=[monitor.pk for monitor in existing],
                    owner=user,
                ).delete()

            now = timezone.now()

            all_checks = []
            all_incidents = []
            all_metrics = []
            demo_monitors = []

            for index, (name, host, latency, state, windows) in enumerate(SCENARIOS):
                monitor = Monitor.objects.create(
                    owner=user,
                    name=name,
                    url=demo_url(host),
                    interval_seconds=3600,
                    timeout_seconds=10,
                    failure_threshold=2,
                    recovery_threshold=2,
                    retention_policy=Monitor.RetentionPolicy.FOREVER,
                    enabled=state != "paused",
                    next_check_at=None,
                )

                created_at = (
                    now - timedelta(hours=2) if state == "pending" else now - timedelta(days=31)
                )

                Monitor.objects.filter(
                    pk=monitor.pk,
                ).update(
                    created_at=created_at,
                )

                (
                    checks,
                    incidents,
                    metrics,
                    status,
                    failures,
                    recoveries,
                    last_checked,
                ) = build_history(
                    monitor,
                    now=now,
                    base_latency=latency,
                    scenario=state,
                    windows=windows,
                    seed=2026 + index,
                )

                monitor.status = status
                monitor.consecutive_failures = failures
                monitor.consecutive_successes = recoveries
                monitor.last_checked_at = last_checked

                monitor.save(
                    update_fields=[
                        "status",
                        "consecutive_failures",
                        "consecutive_successes",
                        "last_checked_at",
                        "updated_at",
                    ]
                )

                all_checks.extend(checks)
                all_incidents.extend(incidents)
                all_metrics.extend(metrics)
                demo_monitors.append(monitor)

            CheckResult.objects.bulk_create(
                all_checks,
                batch_size=500,
            )
            Incident.objects.bulk_create(
                all_incidents,
                batch_size=500,
            )
            DailyMetric.objects.bulk_create(
                all_metrics,
                batch_size=500,
            )

            page = PublicStatusPage.objects.filter(
                owner=user,
            ).first()

            if page is None:
                if PublicStatusPage.objects.filter(
                    slug=DEMO_SLUG,
                ).exists():
                    raise CommandError("The demo status-page slug is already in use.")

                page = PublicStatusPage.objects.create(
                    owner=user,
                    slug=DEMO_SLUG,
                    title="PulseCheck System Status",
                    description=("Synthetic service health data for a portfolio demonstration."),
                    enabled=True,
                )

            # Do not replace existing page configuration or selections.
            page.monitors.add(*demo_monitors)

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo ready for {DEMO_EMAIL}: "
                f"{len(demo_monitors)} monitors, "
                f"{len(all_checks)} checks, "
                f"{len(all_incidents)} incidents, "
                f"{len(all_metrics)} daily metrics."
            )
        )

        self.stdout.write(f"Public page: /status/{page.slug}")

        if not page.enabled:
            self.stdout.write(
                self.style.WARNING(
                    "The existing public status page is disabled. "
                    "Enable it through the application to view it."
                )
            )
