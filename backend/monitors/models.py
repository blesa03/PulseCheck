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


class CheckResult(models.Model):
    class Result(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        FAILURE = "FAILURE", "Failure"

    class ErrorType(models.TextChoices):
        TIMEOUT = "TIMEOUT", "Timeout"
        DNS_ERROR = "DNS_ERROR", "DNS error"
        CONNECTION_ERROR = (
            "CONNECTION_ERROR",
            "Connection error",
        )
        SSL_ERROR = "SSL_ERROR", "SSL error"
        TOO_MANY_REDIRECTS = (
            "TOO_MANY_REDIRECTS",
            "Too many redirects",
        )

    monitor = models.ForeignKey(
        Monitor,
        on_delete=models.CASCADE,
        related_name="check_results",
    )

    result = models.CharField(
        max_length=10,
        choices=Result.choices,
    )

    http_status = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
    )

    response_time_ms = models.PositiveIntegerField()

    error_type = models.CharField(
        max_length=30,
        choices=ErrorType.choices,
        null=True,
        blank=True,
    )

    checked_at = models.DateTimeField(
        default=timezone.now,
    )

    class Meta:
        ordering = [
            "-checked_at",
            "-id",
        ]

        indexes = [
            models.Index(
                fields=[
                    "monitor",
                    "-checked_at",
                ],
            ),
        ]

    def __str__(self):
        return f"{self.monitor.name}: {self.result} at {self.checked_at}"


class Incident(models.Model):
    monitor = models.ForeignKey(
        Monitor,
        on_delete=models.CASCADE,
        related_name="incidents",
    )

    started_at = models.DateTimeField(
        default=timezone.now,
    )

    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = [
            "-started_at",
            "-id",
        ]

        indexes = [
            models.Index(
                fields=[
                    "monitor",
                    "-started_at",
                ],
            ),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "monitor",
                ],
                condition=models.Q(
                    resolved_at__isnull=True,
                ),
                name="one_open_incident_per_monitor",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        resolved_at__isnull=True,
                    )
                    | models.Q(
                        resolved_at__gte=models.F(
                            "started_at",
                        ),
                    )
                ),
                name="incident_resolution_after_start",
            ),
        ]

    @property
    def duration_seconds(self) -> int:
        finished_at = self.resolved_at or timezone.now()

        return max(
            0,
            int((finished_at - self.started_at).total_seconds()),
        )

    def __str__(self):
        state = "open" if self.resolved_at is None else "resolved"

        return f"{self.monitor.name}: {state} incident"


class DailyMetric(models.Model):
    monitor = models.ForeignKey(
        Monitor,
        on_delete=models.CASCADE,
        related_name="daily_metrics",
    )

    date = models.DateField()

    total_checks = models.PositiveBigIntegerField(
        default=0,
    )

    successful_checks = models.PositiveBigIntegerField(
        default=0,
    )

    failed_checks = models.PositiveBigIntegerField(
        default=0,
    )

    total_response_time_ms = models.PositiveBigIntegerField(
        default=0,
    )

    min_response_time_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    max_response_time_ms = models.PositiveIntegerField(
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
            "-date",
        ]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "monitor",
                    "date",
                ],
                name="unique_daily_metric_monitor_date",
            ),
        ]

    @property
    def average_response_time_ms(
        self,
    ) -> float | None:
        if self.total_checks == 0:
            return None

        return round(
            self.total_response_time_ms / self.total_checks,
            2,
        )

    def __str__(self):
        return f"{self.monitor.name}: {self.date}"
