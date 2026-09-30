import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from monitors.models import Monitor
from monitors.services.checks import (
    MonitorCheckDisabled,
    execute_monitor_check,
)
from monitors.services.retention import (
    purge_expired_check_results as purge_check_results_by_retention,
)

logger = logging.getLogger(__name__)


def calculate_next_check_at(
    *,
    scheduled_for,
    interval_seconds: int,
    now,
):
    if interval_seconds <= 0:
        raise ValueError(
            "Interval must be positive.",
        )

    if scheduled_for is None:
        return now + timedelta(
            seconds=interval_seconds,
        )

    if scheduled_for > now:
        return scheduled_for

    elapsed_seconds = (now - scheduled_for).total_seconds()

    intervals_elapsed = int(elapsed_seconds // interval_seconds) + 1

    return scheduled_for + timedelta(
        seconds=(intervals_elapsed * interval_seconds),
    )


@shared_task(
    name="monitors.execute_scheduled_monitor_check",
)
def execute_scheduled_monitor_check(
    monitor_id: int,
):
    try:
        monitor = Monitor.objects.get(
            pk=monitor_id,
        )
    except Monitor.DoesNotExist:
        return {
            "status": "missing",
            "monitor_id": monitor_id,
        }

    if not monitor.enabled or monitor.status == Monitor.Status.PAUSED:
        return {
            "status": "skipped",
            "reason": "disabled",
            "monitor_id": monitor_id,
        }

    try:
        check_result = execute_monitor_check(
            monitor,
        )
    except MonitorCheckDisabled:
        return {
            "status": "skipped",
            "reason": "disabled",
            "monitor_id": monitor_id,
        }

    return {
        "status": "completed",
        "monitor_id": monitor_id,
        "check_result_id": (check_result.pk),
        "result": check_result.result,
    }


@shared_task(
    name="monitors.dispatch_due_monitors",
)
def dispatch_due_monitors():
    now = timezone.now()

    claims = []

    with transaction.atomic():
        due_monitors = list(
            Monitor.objects.select_for_update(
                skip_locked=True,
            )
            .filter(
                enabled=True,
                next_check_at__isnull=False,
                next_check_at__lte=now,
            )
            .order_by(
                "next_check_at",
                "id",
            )[: settings.MONITOR_DISPATCH_BATCH_SIZE]
        )

        for monitor in due_monitors:
            reserved_next_check_at = calculate_next_check_at(
                scheduled_for=(monitor.next_check_at),
                interval_seconds=(monitor.interval_seconds),
                now=now,
            )

            monitor.next_check_at = reserved_next_check_at

            claims.append(
                (
                    monitor.pk,
                    reserved_next_check_at,
                )
            )

        if due_monitors:
            Monitor.objects.bulk_update(
                due_monitors,
                [
                    "next_check_at",
                ],
            )

    dispatched = 0
    enqueue_failures = 0

    for (
        monitor_id,
        reserved_next_check_at,
    ) in claims:
        try:
            (
                execute_scheduled_monitor_check.delay(
                    monitor_id,
                )
            )

            dispatched += 1

        except Exception:
            enqueue_failures += 1

            logger.exception(
                ("Could not enqueue scheduled monitor check for monitor %s."),
                monitor_id,
            )

            Monitor.objects.filter(
                pk=monitor_id,
                enabled=True,
                next_check_at=(reserved_next_check_at),
            ).update(
                next_check_at=(timezone.now()),
            )

    return {
        "claimed": len(claims),
        "dispatched": dispatched,
        "enqueue_failures": (enqueue_failures),
    }


@shared_task(
    name="monitors.purge_expired_check_results",
)
def purge_expired_check_results():
    return purge_check_results_by_retention()
