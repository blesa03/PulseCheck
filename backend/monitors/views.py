from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from monitors.models import Monitor
from monitors.serializers import MonitorSerializer


class MonitorViewSet(ModelViewSet):
    serializer_class = MonitorSerializer
    permission_classes = [
        IsAuthenticated,
    ]

    def get_queryset(self):
        return Monitor.objects.filter(
            owner=self.request.user,
        )

    def perform_create(self, serializer):
        serializer.save(
            owner=self.request.user,
        )

    @action(
        detail=True,
        methods=["post"],
    )
    def pause(self, request, pk=None):
        monitor = self.get_object()

        monitor.enabled = False
        monitor.status = Monitor.Status.PAUSED

        monitor.consecutive_failures = 0
        monitor.consecutive_successes = 0

        monitor.next_check_at = None

        monitor.save(
            update_fields=[
                "enabled",
                "status",
                "consecutive_failures",
                "consecutive_successes",
                "next_check_at",
                "updated_at",
            ]
        )

        return Response(
            self.get_serializer(
                monitor,
            ).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
    )
    def resume(self, request, pk=None):
        monitor = self.get_object()

        monitor.enabled = True
        monitor.status = None

        monitor.consecutive_failures = 0
        monitor.consecutive_successes = 0

        monitor.next_check_at = timezone.now()

        monitor.save(
            update_fields=[
                "enabled",
                "status",
                "consecutive_failures",
                "consecutive_successes",
                "next_check_at",
                "updated_at",
            ]
        )

        return Response(
            self.get_serializer(
                monitor,
            ).data,
            status=status.HTTP_200_OK,
        )
