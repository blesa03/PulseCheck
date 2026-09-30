from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from monitors.models import (
    CheckResult,
    Monitor,
)

RETENTION_WINDOWS = {
    Monitor.RetentionPolicy.HOURS_48: timedelta(hours=48),
    Monitor.RetentionPolicy.DAYS_7: timedelta(days=7),
    Monitor.RetentionPolicy.DAYS_14: timedelta(days=14),
    Monitor.RetentionPolicy.DAYS_30: timedelta(days=30),
}


def purge_expired_check_results(
    *,
    now=None,
    batch_size: int | None = None,
):
    if now is None:
        now = timezone.now()

    if batch_size is None:
        batch_size = settings.CHECK_RETENTION_DELETE_BATCH_SIZE

    if batch_size <= 0:
        raise ValueError(
            "Retention batch size must be positive.",
        )

    deleted_by_policy = {}
    total_deleted = 0

    for (
        policy,
        retention_window,
    ) in RETENTION_WINDOWS.items():
        cutoff = now - retention_window

        policy_deleted = 0

        queryset = CheckResult.objects.filter(
            monitor__retention_policy=(policy),
            checked_at__lt=cutoff,
        ).order_by("id")

        while True:
            ids = list(
                queryset.values_list(
                    "id",
                    flat=True,
                )[:batch_size]
            )

            if not ids:
                break

            deleted_count, _ = CheckResult.objects.filter(
                id__in=ids,
            ).delete()

            policy_deleted += deleted_count

        deleted_by_policy[str(policy)] = policy_deleted

        total_deleted += policy_deleted

    return {
        "total_deleted": (total_deleted),
        "deleted_by_policy": (deleted_by_policy),
    }
