from django.contrib import admin

from monitors.models import (
    CheckResult,
    Incident,
    Monitor,
)


@admin.register(Monitor)
class MonitorAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "status",
        "enabled",
        "interval_seconds",
        "last_checked_at",
    )

    list_filter = (
        "status",
        "enabled",
        "retention_policy",
    )

    search_fields = (
        "name",
        "url",
        "owner__email",
    )


@admin.register(CheckResult)
class CheckResultAdmin(admin.ModelAdmin):
    list_display = (
        "monitor",
        "result",
        "http_status",
        "response_time_ms",
        "error_type",
        "checked_at",
    )

    list_filter = (
        "result",
        "error_type",
    )

    search_fields = (
        "monitor__name",
        "monitor__url",
        "monitor__owner__email",
    )

    readonly_fields = (
        "monitor",
        "result",
        "http_status",
        "response_time_ms",
        "error_type",
        "checked_at",
    )


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = (
        "monitor",
        "started_at",
        "resolved_at",
        "duration_seconds",
    )

    list_filter = ("resolved_at",)

    search_fields = (
        "monitor__name",
        "monitor__url",
        "monitor__owner__email",
    )

    readonly_fields = (
        "monitor",
        "started_at",
        "resolved_at",
        "duration_seconds",
    )
