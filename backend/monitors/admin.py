from django.contrib import admin

from monitors.models import (
    CheckResult,
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
