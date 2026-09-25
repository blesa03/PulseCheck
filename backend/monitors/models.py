from django.conf import settings
from django.db import models
from django.utils import timezone


def default_accepted_status_ranges():
    return [
        {
            "min": 200,
            "max": 399,
        }
    ]


class Monitor(models.Model):
    class Status(models.TextChoices):
        UP = "UP", "Up"
        DEGRADED = "DEGRADED", "Degraded"
        DOWN = "DOWN", "Down"
        PAUSED = "PAUSED", "Paused"

    class RetentionPolicy(models.TextChoices):
        HOURS_48 = "48_HOURS", "48 hours"
        DAYS_7 = "7_DAYS", "7 days"
        DAYS_14 = "14_DAYS", "14 days"
        DAYS_30 = "30_DAYS", "30 days"
        FOREVER = "FOREVER", "Forever"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="monitors",
    )

    name = models.CharField(
        max_length=120,
    )

    url = models.URLField(
        max_length=2048,
    )

    interval_seconds = models.PositiveIntegerField(
        default=60,
    )

    timeout_seconds = models.PositiveSmallIntegerField(
        default=10,
    )

    failure_threshold = models.PositiveSmallIntegerField(
        default=2,
    )

    recovery_threshold = models.PositiveSmallIntegerField(
        default=1,
    )

    retention_policy = models.CharField(
        max_length=10,
        choices=RetentionPolicy.choices,
        default=RetentionPolicy.DAYS_30,
    )

    follow_redirects = models.BooleanField(
        default=True,
    )

    accepted_status_ranges = models.JSONField(
        default=default_accepted_status_ranges,
    )

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        null=True,
        blank=True,
    )

    enabled = models.BooleanField(
        default=True,
    )

    consecutive_failures = models.PositiveIntegerField(
        default=0,
    )

    consecutive_successes = models.PositiveIntegerField(
        default=0,
    )

    last_checked_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    next_check_at = models.DateTimeField(
        default=timezone.now,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = [
            "-created_at",
        ]

        indexes = [
            models.Index(
                fields=[
                    "owner",
                    "enabled",
                    "next_check_at",
                ],
            ),
        ]

        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        interval_seconds__gte=30,
                    )
                    & models.Q(
                        interval_seconds__lte=86400,
                    )
                ),
                name="monitor_interval_range",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        timeout_seconds__gte=1,
                    )
                    & models.Q(
                        timeout_seconds__lte=30,
                    )
                ),
                name="monitor_timeout_range",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        failure_threshold__gte=1,
                    )
                    & models.Q(
                        failure_threshold__lte=5,
                    )
                ),
                name="monitor_failure_threshold_range",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        recovery_threshold__gte=1,
                    )
                    & models.Q(
                        recovery_threshold__lte=5,
                    )
                ),
                name="monitor_recovery_threshold_range",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.url})"
