from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from monitors.models import CheckResult, Incident, Monitor, PublicStatusPage
from monitors.services.target_policy import UnsafeTarget, validate_target_url


class MonitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Monitor
        fields = (
            "id",
            "name",
            "url",
            "interval_seconds",
            "timeout_seconds",
            "failure_threshold",
            "recovery_threshold",
            "retention_policy",
            "follow_redirects",
            "accepted_status_ranges",
            "status",
            "enabled",
            "consecutive_failures",
            "consecutive_successes",
            "last_checked_at",
            "next_check_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "enabled",
            "consecutive_failures",
            "consecutive_successes",
            "last_checked_at",
            "next_check_at",
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Monitor name cannot be empty.")
        return name

    def validate_url(self, value):
        try:
            validate_target_url(value)
        except UnsafeTarget as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value

    def validate_interval_seconds(self, value):
        if not 30 <= value <= 86400:
            raise serializers.ValidationError("Interval must be between 30 and 86400 seconds.")
        return value

    def validate_timeout_seconds(self, value):
        if not 1 <= value <= 30:
            raise serializers.ValidationError("Timeout must be between 1 and 30 seconds.")
        return value

    def validate_failure_threshold(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Failure threshold must be between 1 and 5.")
        return value

    def validate_recovery_threshold(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Recovery threshold must be between 1 and 5.")
        return value

    def validate_accepted_status_ranges(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("At least one accepted status range is required.")
        if len(value) > 20:
            raise serializers.ValidationError("No more than 20 status ranges are allowed.")

        normalized = []
        for item in value:
            if not isinstance(item, dict) or set(item) != {"min", "max"}:
                raise serializers.ValidationError("Each status range requires only min and max.")
            lower, upper = item["min"], item["max"]
            if (
                isinstance(lower, bool)
                or isinstance(upper, bool)
                or not isinstance(lower, int)
                or not isinstance(upper, int)
            ):
                raise serializers.ValidationError("Status range values must be integers.")
            if not (100 <= lower <= 599 and 100 <= upper <= 599):
                raise serializers.ValidationError("HTTP status codes must be between 100 and 599.")
            if lower > upper:
                raise serializers.ValidationError("Status range min cannot exceed max.")
            normalized.append({"min": lower, "max": upper})

        normalized.sort(key=lambda row: row["min"])
        for previous, current in zip(normalized, normalized[1:], strict=False):
            if current["min"] <= previous["max"]:
                raise serializers.ValidationError("Accepted status ranges cannot overlap.")
        return normalized

    @transaction.atomic
    def update(self, instance, validated_data):
        monitor = Monitor.objects.select_for_update().get(pk=instance.pk)
        changed = any(getattr(monitor, key) != value for key, value in validated_data.items())
        if not changed:
            return monitor

        url_changed = "url" in validated_data and monitor.url != validated_data["url"]
        interval_changed = (
            "interval_seconds" in validated_data
            and monitor.interval_seconds != validated_data["interval_seconds"]
        )
        for field, value in validated_data.items():
            setattr(monitor, field, value)

        if url_changed:
            now = timezone.now()
            monitor.status = None if monitor.enabled else Monitor.Status.PAUSED
            monitor.consecutive_failures = 0
            monitor.consecutive_successes = 0
            monitor.last_checked_at = None
            monitor.next_check_at = now if monitor.enabled else None
            Incident.objects.filter(monitor=monitor, resolved_at__isnull=True).update(
                resolved_at=now
            )
        elif interval_changed and monitor.enabled:
            monitor.next_check_at = timezone.now() + timedelta(seconds=monitor.interval_seconds)

        monitor.config_version += 1
        monitor.save()
        return monitor


class CheckResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckResult
        fields = (
            "id",
            "monitor",
            "result",
            "http_status",
            "response_time_ms",
            "error_type",
            "checked_at",
        )
        read_only_fields = fields


class IncidentSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = Incident
        fields = ("id", "monitor", "started_at", "resolved_at", "duration_seconds")
        read_only_fields = fields


class MonitorMetricsQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(
        choices=("24h", "7d", "30d", "all"), default="24h", required=False
    )


class MonitorChecksQuerySerializer(serializers.Serializer):
    limit = serializers.IntegerField(min_value=1, max_value=100, default=50, required=False)


class MonitorIncidentsQuerySerializer(serializers.Serializer):
    limit = serializers.IntegerField(min_value=1, max_value=100, default=100, required=False)


class PublicStatusPageConfigSerializer(serializers.ModelSerializer):
    monitor_ids = serializers.PrimaryKeyRelatedField(
        source="monitors", many=True, required=False, queryset=Monitor.objects.none()
    )

    class Meta:
        model = PublicStatusPage
        fields = (
            "id",
            "title",
            "description",
            "slug",
            "enabled",
            "monitor_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["monitor_ids"].child_relation.queryset = Monitor.objects.filter(
                owner=request.user
            )

    def validate_monitor_ids(self, value):
        if len(value) > 100:
            raise serializers.ValidationError("At most 100 public monitors may be selected.")
        return value

    def validate_title(self, value):
        title = value.strip()
        if not title:
            raise serializers.ValidationError("Status page title cannot be empty.")
        return title

    def validate_description(self, value):
        return value.strip()

    def validate_slug(self, value):
        slug = value.strip().lower()
        if len(slug) < 3:
            raise serializers.ValidationError(
                "Status page slug must contain at least 3 characters."
            )
        queryset = PublicStatusPage.objects.filter(slug=slug)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("This status page slug is already in use.")
        return slug

    def update(self, instance, validated_data):
        monitors = validated_data.pop("monitors", None)
        instance = super().update(instance, validated_data)
        if monitors is not None:
            instance.monitors.set(monitors)
        return instance
