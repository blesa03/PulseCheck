from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from monitors.models import PublicStatusPage
from users.models import User


@pytest.mark.django_db
def test_public_status_rate_limit():
    owner = User.objects.create_user(
        email="rate-owner@example.com",
        password="Rugged-Pulse-2026!",
    )

    PublicStatusPage.objects.create(
        owner=owner,
        slug="ratelimit",
        enabled=True,
    )

    client_ip = "192.0.2.123"
    cache_key = f"throttle_public_status_{client_ip}"

    client = APIClient(
        REMOTE_ADDR=client_ip,
    )

    with patch.dict(
        ScopedRateThrottle.THROTTLE_RATES,
        {"public_status": "2/min"},
    ):
        cache.delete(cache_key)

        try:
            first_response = client.get(
                "/api/public/status/ratelimit/",
            )

            second_response = client.get(
                "/api/public/status/ratelimit/",
            )

            third_response = client.get(
                "/api/public/status/ratelimit/",
            )

            assert first_response.status_code == 200
            assert second_response.status_code == 200
            assert third_response.status_code == 429

        finally:
            cache.delete(cache_key)