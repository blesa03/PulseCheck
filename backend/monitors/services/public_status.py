from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from monitors.models import DailyMetric, Incident, Monitor, PublicStatusPage
from monitors.services.analytics import (
    _add_daily_uptime,
    _build_uptime_payload,
    resolve_metrics_window,
)

PUBLIC_INCIDENT_LIMIT = 10


def public_monitor_status(monitor: Monitor):
    if not monitor.enabled or monitor.status == Monitor.Status.PAUSED:
        return "PAUSED"
    if monitor.status is None:
        return "PENDING"
    return monitor.status


def calculate_overall_status(statuses):
    statuses = list(statuses)
    if not statuses:
        return "NO_DATA"
    for status in ("DOWN", "DEGRADED", "PENDING", "UP"):
        if status in statuses:
            return status
    return "PAUSED"


def build_public_status_payload(page: PublicStatusPage):
    now = timezone.now()
    monitors = list(page.monitors.filter(owner_id=page.owner_id).order_by("name", "id"))
    ids = [monitor.pk for monitor in monitors]
    day_start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
    earliest_day = day_start - timedelta(days=29)

    daily_by_monitor = defaultdict(list)
    for metric in DailyMetric.objects.filter(
        monitor_id__in=ids,
        date__gte=earliest_day.date(),
        date__lte=now.date(),
    ).order_by("date"):
        daily_by_monitor[metric.monitor_id].append(metric)

    incidents_by_monitor = defaultdict(list)
    for incident in (
        Incident.objects.filter(
            monitor_id__in=ids,
            started_at__lt=now,
        )
        .filter(Q(resolved_at__isnull=True) | Q(resolved_at__gt=earliest_day))
        .order_by("started_at")
    ):
        incidents_by_monitor[incident.monitor_id].append(incident)

    monitor_payloads = []
    statuses = []
    for monitor in monitors:
        status = public_monitor_status(monitor)
        statuses.append(status)
        start, _ = resolve_metrics_window(monitor, "30d", now=now)
        incidents = incidents_by_monitor[monitor.pk]
        metrics = [
            row for row in daily_by_monitor[monitor.pk] if start.date() <= row.date <= now.date()
        ]
        rows = [{"date": metric.date} for metric in metrics]
        daily = _add_daily_uptime(
            rows,
            incidents=incidents,
            period_start=start,
            period_end=now,
        )
        observed = sum(metric.total_checks for metric in metrics) > 0
        uptime = _build_uptime_payload(incidents, start, now)
        monitor_payloads.append(
            {
                "id": monitor.pk,
                "name": monitor.name,
                "status": status,
                "last_checked_at": monitor.last_checked_at,
                "uptime_30d": uptime["percentage"] if observed else None,
                "daily": [
                    {
                        "date": row["date"],
                        "uptime_percentage": row["uptime_percentage"],
                    }
                    for row in daily
                ],
            }
        )

    recent_incidents = (
        Incident.objects.filter(monitor_id__in=ids)
        .select_related("monitor")
        .order_by("-started_at", "-id")[:PUBLIC_INCIDENT_LIMIT]
    )
    incident_payloads = [
        {
            "id": incident.pk,
            "monitor_id": incident.monitor_id,
            "monitor_name": incident.monitor.name,
            "started_at": incident.started_at,
            "resolved_at": incident.resolved_at,
            "duration_seconds": incident.duration_seconds,
        }
        for incident in recent_incidents
    ]
    return {
        "slug": page.slug,
        "title": page.title,
        "description": page.description,
        "overall_status": calculate_overall_status(statuses),
        "generated_at": now,
        "monitors": monitor_payloads,
        "incidents": incident_payloads,
    }
