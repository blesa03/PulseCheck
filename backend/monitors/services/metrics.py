from django.db.models import (
    Count,
    Max,
    Min,
    Q,
    Sum,
)
from django.db.models.functions import (
    TruncDate,
)
from django.utils import timezone

from monitors.models import (
    CheckResult,
    DailyMetric,
    Monitor,
)


def update_daily_metric(
    monitor: Monitor,
    check_result: CheckResult,
) -> DailyMetric:
    metric_date = timezone.localdate(
        check_result.checked_at,
    )

    success = check_result.result == CheckResult.Result.SUCCESS

    metric, created = DailyMetric.objects.select_for_update().get_or_create(
        monitor=monitor,
        date=metric_date,
        defaults={
            "total_checks": 1,
            "successful_checks": (1 if success else 0),
            "failed_checks": (0 if success else 1),
            "total_response_time_ms": (check_result.response_time_ms),
            "min_response_time_ms": (check_result.response_time_ms),
            "max_response_time_ms": (check_result.response_time_ms),
        },
    )

    if created:
        return metric

    metric.total_checks += 1

    if success:
        metric.successful_checks += 1
    else:
        metric.failed_checks += 1

    metric.total_response_time_ms += check_result.response_time_ms

    if (
        metric.min_response_time_ms is None
        or check_result.response_time_ms < metric.min_response_time_ms
    ):
        metric.min_response_time_ms = check_result.response_time_ms

    if (
        metric.max_response_time_ms is None
        or check_result.response_time_ms > metric.max_response_time_ms
    ):
        metric.max_response_time_ms = check_result.response_time_ms

    metric.save(
        update_fields=[
            "total_checks",
            "successful_checks",
            "failed_checks",
            "total_response_time_ms",
            "min_response_time_ms",
            "max_response_time_ms",
            "updated_at",
        ]
    )

    return metric


def backfill_missing_daily_metrics() -> int:
    aggregates = (
        CheckResult.objects.annotate(
            metric_date=TruncDate(
                "checked_at",
            ),
        )
        .values(
            "monitor_id",
            "metric_date",
        )
        .annotate(
            total_checks=Count(
                "id",
            ),
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
        .order_by()
    )

    created_count = 0

    for aggregate in aggregates.iterator():
        _, created = DailyMetric.objects.get_or_create(
            monitor_id=(aggregate["monitor_id"]),
            date=aggregate["metric_date"],
            defaults={
                "total_checks": (aggregate["total_checks"]),
                "successful_checks": (aggregate["successful_checks"]),
                "failed_checks": (aggregate["failed_checks"]),
                "total_response_time_ms": (aggregate["total_response_time_ms"] or 0),
                "min_response_time_ms": (aggregate["min_response_time_ms"]),
                "max_response_time_ms": (aggregate["max_response_time_ms"]),
            },
        )

        if created:
            created_count += 1

    return created_count
