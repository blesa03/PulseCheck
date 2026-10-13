from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from monitors.models import Monitor, PublicStatusPage
from monitors.serializers import (
    CheckResultSerializer,
    IncidentSerializer,
    MonitorChecksQuerySerializer,
    MonitorIncidentsQuerySerializer,
    MonitorMetricsQuerySerializer,
    MonitorSerializer,
    PublicStatusPageConfigSerializer,
)
from monitors.services.analytics import build_monitor_metrics
from monitors.services.checks import (
    MonitorCheckDisabled,
    MonitorCheckObsolete,
    execute_monitor_check,
)
from monitors.services.public_status import build_public_status_payload


class MonitorViewSet(ModelViewSet):
    serializer_class = MonitorSerializer
    permission_classes = [IsAuthenticated]

    # Required by DRF to accept throttle_scope in @action.
    throttle_scope = None

    def get_queryset(self):
        return Monitor.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @transaction.atomic
    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        monitor = Monitor.objects.select_for_update().get(pk=self.get_object().pk)

        if monitor.enabled or monitor.status != Monitor.Status.PAUSED:
            monitor.enabled = False
            monitor.status = Monitor.Status.PAUSED
            monitor.consecutive_failures = 0
            monitor.consecutive_successes = 0
            monitor.next_check_at = None
            monitor.config_version += 1
            monitor.save()

        return Response(self.get_serializer(monitor).data)

    @transaction.atomic
    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        monitor = Monitor.objects.select_for_update().get(pk=self.get_object().pk)

        if not monitor.enabled:
            monitor.enabled = True
            monitor.status = None
            monitor.consecutive_failures = 0
            monitor.consecutive_successes = 0
            monitor.next_check_at = timezone.now()
            monitor.config_version += 1
            monitor.save()

        return Response(self.get_serializer(monitor).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="check",
        throttle_classes=[ScopedRateThrottle],
        throttle_scope="manual_check",
    )
    def check_now(self, request, pk=None):
        monitor = self.get_object()

        try:
            check_result = execute_monitor_check(monitor)
        except (MonitorCheckDisabled, MonitorCheckObsolete):
            return Response(
                {
                    "detail": ("Monitor was disabled or changed during the check."),
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "check_result": CheckResultSerializer(check_result).data,
                "monitor": MonitorSerializer(monitor).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def checks(self, request, pk=None):
        monitor = self.get_object()

        query = MonitorChecksQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        check_results = monitor.check_results.all()[: query.validated_data["limit"]]

        return Response(
            CheckResultSerializer(
                check_results,
                many=True,
            ).data
        )

    @action(detail=True, methods=["get"])
    def incidents(self, request, pk=None):
        monitor = self.get_object()

        query = MonitorIncidentsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        items = monitor.incidents.all()[: query.validated_data["limit"]]

        return Response(
            IncidentSerializer(
                items,
                many=True,
            ).data
        )

    @action(detail=True, methods=["get"])
    def metrics(self, request, pk=None):
        monitor = self.get_object()

        query = MonitorMetricsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        return Response(
            build_monitor_metrics(
                monitor,
                query.validated_data["period"],
            )
        )


class StatusPageConfigView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def get_page(user):
        page, _ = PublicStatusPage.objects.get_or_create(owner=user)
        return page

    def get(self, request):
        page = self.get_page(request.user)

        serializer = PublicStatusPageConfigSerializer(
            page,
            context={"request": request},
        )

        return Response(serializer.data)

    def patch(self, request):
        page = self.get_page(request.user)

        serializer = PublicStatusPageConfigSerializer(
            page,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


class PublicStatusPageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_status"

    def get(self, request, slug):
        page = get_object_or_404(
            PublicStatusPage,
            slug=slug.lower(),
            enabled=True,
        )

        return Response(build_public_status_payload(page))
