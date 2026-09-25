from django.contrib import admin
from django.urls import include, path

from core.views import health_check, readiness_check

urlpatterns = [
    path(
        "admin/",
        admin.site.urls,
    ),
    path(
        "api/health/",
        health_check,
        name="health",
    ),
    path(
        "api/health/ready/",
        readiness_check,
        name="readiness",
    ),
    path(
        "api/auth/",
        include("users.urls"),
    ),
    path(
        "api/",
        include("monitors.urls"),
    ),
]
