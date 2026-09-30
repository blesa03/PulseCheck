from django.utils import timezone

from monitors.models import (
    Incident,
    Monitor,
    PublicStatusPage,
)
from monitors.services.analytics import (
    build_monitor_metrics,
)

PUBLIC_METRICS_PERIOD = "30d"
PUBLIC_INCIDENT_LIMIT = 10


def public_monitor_status(
    monitor: Monitor,
):
    if not monitor.enabled or monitor.status == Monitor.Status.PAUSED:
        return "PAUSED"

    if monitor.status is None:
        return "PENDING"

    return monitor.status


def calculate_overall_status(
    statuses,
):
    statuses = list(statuses)

    if not statuses:
        return "NO_DATA"

    if "DOWN" in statuses:
        return "DOWN"

    if "DEGRADED" in statuses:
        return "DEGRADED"

    if "PENDING" in statuses:
        return "PENDING"

    if "UP" in statuses:
        return "UP"

    return "PAUSED"


def build_public_status_payload(
    page: PublicStatusPage,
):
    monitors = list(
        page.monitors.filter(
            owner=page.owner,
        ).order_by(
            "name",
            "id",
        )
    )

    monitor_payloads = []
    statuses = []

    for monitor in monitors:
        status = public_monitor_status(
            monitor,
        )

        statuses.append(status)

        metrics = build_monitor_metrics(
            monitor,
            PUBLIC_METRICS_PERIOD,
        )

        has_observations = metrics["checks"]["total"] > 0

        daily = [
            {
                "date": row["date"],
                "uptime_percentage": (row["uptime_percentage"]),
            }
            for row in metrics["daily"][-30:]
        ]

        monitor_payloads.append(
            {
                "id": monitor.pk,
                "name": monitor.name,
                "status": status,
                "last_checked_at": (monitor.last_checked_at),
                "uptime_30d": (metrics["uptime"]["percentage"] if has_observations else None),
                "daily": daily,
            }
        )

    incidents = (
        Incident.objects.filter(
            monitor__in=monitors,
        )
        .select_related(
            "monitor",
        )
        .order_by(
            "-started_at",
            "-id",
        )[:PUBLIC_INCIDENT_LIMIT]
    )

    incident_payloads = [
        {
            "id": incident.pk,
            "monitor_id": (incident.monitor_id),
            "monitor_name": (incident.monitor.name),
            "started_at": (incident.started_at),
            "resolved_at": (incident.resolved_at),
            "duration_seconds": (incident.duration_seconds),
        }
        for incident in incidents
    ]

    return {
        "slug": page.slug,
        "title": page.title,
        "description": (page.description),
        "overall_status": (
            calculate_overall_status(
                statuses,
            )
        ),
        "generated_at": (timezone.now()),
        "monitors": (monitor_payloads),
        "incidents": (incident_payloads),
    }
