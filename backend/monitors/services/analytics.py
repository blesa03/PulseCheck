from datetime import datetime, time, timedelta

from django.db.models import Count, Max, Min, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from monitors.models import CheckResult, DailyMetric, Incident, Monitor

METRICS_PERIODS = (
    "24h",
    "7d",
    "30d",
    "all",
)


def resolve_metrics_window(
    monitor: Monitor,
    period: str,
    *,
    now=None,
):
    now = now or timezone.now()

    if period == "24h":
        requested_start = now - timedelta(hours=24)

    elif period == "7d":
        day_start = timezone.localtime(now).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        requested_start = day_start - timedelta(days=6)

    elif period == "30d":
        day_start = timezone.localtime(now).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        requested_start = day_start - timedelta(days=29)

    elif period == "all":
        requested_start = monitor.created_at

    else:
        raise ValueError(
            f"Unsupported metrics period: {period}",
        )

    start = max(
        requested_start,
        monitor.created_at,
    )

    return start, now


def _incident_overlap_seconds(
    incident: Incident,
    start,
    end,
) -> float:
    incident_end = incident.resolved_at or end

    overlap_start = max(
        incident.started_at,
        start,
    )

    overlap_end = min(
        incident_end,
        end,
    )

    if overlap_end <= overlap_start:
        return 0.0

    return (overlap_end - overlap_start).total_seconds()


def _build_uptime_payload(
    incidents,
    start,
    end,
):
    window_seconds = max(
        0.0,
        (end - start).total_seconds(),
    )

    downtime_seconds = sum(
        _incident_overlap_seconds(
            incident,
            start,
            end,
        )
        for incident in incidents
    )

    downtime_seconds = min(
        downtime_seconds,
        window_seconds,
    )

    if window_seconds == 0:
        percentage = None
    else:
        percentage = round(
            ((window_seconds - downtime_seconds) / window_seconds) * 100,
            4,
        )

    return {
        "percentage": percentage,
        "window_seconds": int(round(window_seconds)),
        "downtime_seconds": int(round(downtime_seconds)),
    }


def _build_statistics_payload(
    *,
    total_checks,
    successful_checks,
    failed_checks,
    total_response_time_ms,
    min_response_time_ms,
    max_response_time_ms,
):
    total_checks = total_checks or 0
    successful_checks = successful_checks or 0
    failed_checks = failed_checks or 0

    total_response_time_ms = total_response_time_ms or 0

    if total_checks:
        success_percentage = round(
            (successful_checks / total_checks) * 100,
            4,
        )

        average_response_time_ms = round(
            total_response_time_ms / total_checks,
            2,
        )
    else:
        success_percentage = None
        average_response_time_ms = None

    return {
        "checks": {
            "total": total_checks,
            "successful": successful_checks,
            "failed": failed_checks,
            "success_percentage": (success_percentage),
        },
        "latency": {
            "average_ms": (average_response_time_ms),
            "min_ms": (min_response_time_ms),
            "max_ms": (max_response_time_ms),
        },
    }


def _raw_check_statistics(
    monitor: Monitor,
    start,
    end,
):
    queryset = CheckResult.objects.filter(
        monitor=monitor,
        checked_at__gte=start,
        checked_at__lte=end,
    )

    aggregates = queryset.aggregate(
        total_checks=Count("id"),
        successful_checks=Count(
            "id",
            filter=Q(
                result=(CheckResult.Result.SUCCESS),
            ),
        ),
        failed_checks=Count(
            "id",
            filter=Q(
                result=(CheckResult.Result.FAILURE),
            ),
        ),
        total_response_time_ms=Sum(
            "response_time_ms",
        ),
        min_response_time_ms=Min(
            "response_time_ms",
        ),
        max_response_time_ms=Max(
            "response_time_ms",
        ),
    )

    daily_aggregates = (
        queryset.annotate(
            metric_date=TruncDate(
                "checked_at",
            ),
        )
        .values(
            "metric_date",
        )
        .annotate(
            total_checks=Count("id"),
            successful_checks=Count(
                "id",
                filter=Q(
                    result=(CheckResult.Result.SUCCESS),
                ),
            ),
            failed_checks=Count(
                "id",
                filter=Q(
                    result=(CheckResult.Result.FAILURE),
                ),
            ),
            total_response_time_ms=Sum(
                "response_time_ms",
            ),
            min_response_time_ms=Min(
                "response_time_ms",
            ),
            max_response_time_ms=Max(
                "response_time_ms",
            ),
        )
        .order_by(
            "metric_date",
        )
    )

    daily = []

    for row in daily_aggregates:
        statistics = _build_statistics_payload(
            total_checks=(row["total_checks"]),
            successful_checks=(row["successful_checks"]),
            failed_checks=(row["failed_checks"]),
            total_response_time_ms=(row["total_response_time_ms"]),
            min_response_time_ms=(row["min_response_time_ms"]),
            max_response_time_ms=(row["max_response_time_ms"]),
        )

        daily.append(
            {
                "date": row["metric_date"],
                "total_checks": (statistics["checks"]["total"]),
                "successful_checks": (statistics["checks"]["successful"]),
                "failed_checks": (statistics["checks"]["failed"]),
                "check_success_percentage": (statistics["checks"]["success_percentage"]),
                "average_response_time_ms": (statistics["latency"]["average_ms"]),
                "min_response_time_ms": (statistics["latency"]["min_ms"]),
                "max_response_time_ms": (statistics["latency"]["max_ms"]),
            }
        )

    return (
        _build_statistics_payload(
            **aggregates,
        ),
        daily,
    )


def _daily_metric_statistics(
    monitor: Monitor,
    start,
    end,
):
    queryset = DailyMetric.objects.filter(
        monitor=monitor,
        date__gte=start.date(),
        date__lte=end.date(),
    ).order_by("date")

    aggregates = queryset.aggregate(
        total_checks=Sum(
            "total_checks",
        ),
        successful_checks=Sum(
            "successful_checks",
        ),
        failed_checks=Sum(
            "failed_checks",
        ),
        total_response_time_ms=Sum(
            "total_response_time_ms",
        ),
        min_response_time_ms=Min(
            "min_response_time_ms",
        ),
        max_response_time_ms=Max(
            "max_response_time_ms",
        ),
    )

    daily = []

    for metric in queryset:
        if metric.total_checks:
            success_percentage = round(
                (metric.successful_checks / metric.total_checks) * 100,
                4,
            )
        else:
            success_percentage = None

        daily.append(
            {
                "date": metric.date,
                "total_checks": (metric.total_checks),
                "successful_checks": (metric.successful_checks),
                "failed_checks": (metric.failed_checks),
                "check_success_percentage": (success_percentage),
                "average_response_time_ms": (metric.average_response_time_ms),
                "min_response_time_ms": (metric.min_response_time_ms),
                "max_response_time_ms": (metric.max_response_time_ms),
            }
        )

    return (
        _build_statistics_payload(
            **aggregates,
        ),
        daily,
    )


def _day_start(
    metric_date,
):
    return timezone.make_aware(
        datetime.combine(
            metric_date,
            time.min,
        ),
        timezone.get_current_timezone(),
    )


def _add_daily_uptime(
    daily,
    *,
    incidents,
    period_start,
    period_end,
):
    enriched = []

    for row in daily:
        day_start = _day_start(
            row["date"],
        )

        day_end = day_start + timedelta(days=1)

        bucket_start = max(
            day_start,
            period_start,
        )

        bucket_end = min(
            day_end,
            period_end,
        )

        if bucket_end <= bucket_start:
            continue

        uptime = _build_uptime_payload(
            incidents,
            bucket_start,
            bucket_end,
        )

        enriched.append(
            {
                **row,
                "uptime_percentage": (uptime["percentage"]),
                "window_seconds": (uptime["window_seconds"]),
                "downtime_seconds": (uptime["downtime_seconds"]),
            }
        )

    return enriched


def build_monitor_metrics(
    monitor: Monitor,
    period: str,
    *,
    now=None,
):
    period_start, period_end = resolve_metrics_window(
        monitor,
        period,
        now=now,
    )

    incidents = list(
        Incident.objects.filter(
            monitor=monitor,
            started_at__lt=period_end,
        )
        .filter(
            Q(
                resolved_at__isnull=True,
            )
            | Q(
                resolved_at__gt=(period_start),
            )
        )
        .order_by(
            "started_at",
        )
    )

    uptime = _build_uptime_payload(
        incidents,
        period_start,
        period_end,
    )

    if period == "24h":
        statistics, daily = _raw_check_statistics(
            monitor,
            period_start,
            period_end,
        )
    else:
        statistics, daily = _daily_metric_statistics(
            monitor,
            period_start,
            period_end,
        )

    daily = _add_daily_uptime(
        daily,
        incidents=incidents,
        period_start=period_start,
        period_end=period_end,
    )

    return {
        "monitor_id": monitor.pk,
        "period": period,
        "window": {
            "start": period_start,
            "end": period_end,
        },
        "uptime": uptime,
        "checks": statistics["checks"],
        "latency": statistics["latency"],
        "incidents": {
            "count": len(incidents),
            "open_count": sum(1 for incident in incidents if incident.resolved_at is None),
        },
        "daily": daily,
    }
