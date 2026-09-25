import redis
from django.conf import settings
from django.db import connection
from django.db.utils import DatabaseError
from django.http import JsonResponse


def health_check(request):
    return JsonResponse(
        {
            "status": "ok",
            "service": "pulsecheck-api",
        }
    )


def readiness_check(request):
    checks = {
        "database": False,
        "redis": False,
    }

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        checks["database"] = True
    except DatabaseError:
        pass

    try:
        redis_client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        redis_client.ping()

        checks["redis"] = True
    except redis.RedisError:
        pass

    ready = all(checks.values())

    return JsonResponse(
        {
            "status": "ready" if ready else "not_ready",
            "checks": checks,
        },
        status=200 if ready else 503,
    )
