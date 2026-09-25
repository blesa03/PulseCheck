import pytest
from django.test import Client


class FakeRedisClient:
    def ping(self):
        return True


def test_health_check():
    client = Client()

    response = client.get("/api/health/")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "pulsecheck-api",
    }


@pytest.mark.django_db
def test_readiness_check(monkeypatch):
    monkeypatch.setattr(
        "core.views.redis.Redis.from_url",
        lambda *args, **kwargs: FakeRedisClient(),
    )

    client = Client()

    response = client.get("/api/health/ready/")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {
            "database": True,
            "redis": True,
        },
    }
