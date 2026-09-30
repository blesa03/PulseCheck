from django.urls import path
from rest_framework.routers import (
    DefaultRouter,
)

from monitors.views import (
    MonitorViewSet,
    PublicStatusPageView,
    StatusPageConfigView,
)

router = DefaultRouter()

router.register(
    "monitors",
    MonitorViewSet,
    basename="monitor",
)


urlpatterns = [
    path(
        "status-page/",
        StatusPageConfigView.as_view(),
        name="status-page-config",
    ),
    path(
        "public/status/<slug:slug>/",
        PublicStatusPageView.as_view(),
        name="public-status-page",
    ),
]

urlpatterns += router.urls
