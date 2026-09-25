from django.contrib import admin

from monitors.models import Monitor


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
