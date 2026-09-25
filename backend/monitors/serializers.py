from datetime import timedelta
from urllib.parse import urlsplit

from django.utils import timezone
from rest_framework import serializers

from monitors.models import Monitor


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
            raise serializers.ValidationError(
                "Monitor name cannot be empty.",
            )

        return name

    def validate_url(self, value):
        parsed = urlsplit(value)

        if parsed.scheme not in {
            "http",
            "https",
        }:
            raise serializers.ValidationError(
                "Only HTTP and HTTPS URLs are supported.",
            )

        return value

    def validate_interval_seconds(self, value):
        if not 30 <= value <= 86400:
            raise serializers.ValidationError(
                "Interval must be between 30 and 86400 seconds.",
            )

        return value

    def validate_timeout_seconds(self, value):
        if not 1 <= value <= 30:
            raise serializers.ValidationError(
                "Timeout must be between 1 and 30 seconds.",
            )

        return value

    def validate_failure_threshold(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError(
                "Failure threshold must be between 1 and 5.",
            )

        return value

    def validate_recovery_threshold(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError(
                "Recovery threshold must be between 1 and 5.",
            )

        return value

    def validate_accepted_status_ranges(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError(
                "At least one accepted status range is required.",
            )

        if len(value) > 20:
            raise serializers.ValidationError(
                "No more than 20 status ranges are allowed.",
            )

        normalized_ranges = []

        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    "Each status range must be an object.",
                )

            if set(item) != {
                "min",
                "max",
            }:
                raise serializers.ValidationError(
                    "Each status range must contain only min and max.",
                )

            lower = item["min"]
            upper = item["max"]

            if (
                isinstance(lower, bool)
                or isinstance(upper, bool)
                or not isinstance(lower, int)
                or not isinstance(upper, int)
            ):
                raise serializers.ValidationError(
                    "Status range values must be integers.",
                )

            if not (100 <= lower <= 599 and 100 <= upper <= 599):
                raise serializers.ValidationError(
                    "HTTP status codes must be between 100 and 599.",
                )

            if lower > upper:
                raise serializers.ValidationError(
                    "Status range min cannot exceed max.",
                )

            normalized_ranges.append(
                {
                    "min": lower,
                    "max": upper,
                }
            )

        normalized_ranges.sort(
            key=lambda status_range: status_range["min"],
        )

        for previous, current in zip(
            normalized_ranges,
            normalized_ranges[1:],
            strict=False,
        ):
            if current["min"] <= previous["max"]:
                raise serializers.ValidationError(
                    "Accepted status ranges cannot overlap.",
                )

        return normalized_ranges

    def update(self, instance, validated_data):
        previous_url = instance.url

        url_changed = "url" in validated_data and validated_data["url"] != previous_url

        interval_changed = (
            "interval_seconds" in validated_data
            and validated_data["interval_seconds"] != instance.interval_seconds
        )

        monitor = super().update(
            instance,
            validated_data,
        )

        fields_to_update = []

        if url_changed:
            monitor.status = None if monitor.enabled else Monitor.Status.PAUSED

            monitor.consecutive_failures = 0
            monitor.consecutive_successes = 0
            monitor.last_checked_at = None

            monitor.next_check_at = timezone.now() if monitor.enabled else None

            fields_to_update.extend(
                [
                    "status",
                    "consecutive_failures",
                    "consecutive_successes",
                    "last_checked_at",
                    "next_check_at",
                ]
            )

        elif interval_changed and monitor.enabled:
            monitor.next_check_at = timezone.now() + timedelta(
                seconds=monitor.interval_seconds,
            )

            fields_to_update.append(
                "next_check_at",
            )

        if fields_to_update:
            monitor.save(
                update_fields=fields_to_update,
            )

        return monitor
