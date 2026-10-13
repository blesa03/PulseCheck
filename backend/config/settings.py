import os
from pathlib import Path

from celery.schedules import crontab
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None else int(value)


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend")

if not DEBUG and SECRET_KEY == "unsafe-development-key-change-me":
    raise ImproperlyConfigured("Set a unique DJANGO_SECRET_KEY when DEBUG=False.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "core",
    "users",
    "monitors",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "pulsecheck"),
        "USER": os.getenv("POSTGRES_USER", "pulsecheck"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "pulsecheck"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.User"

# A shared cache keeps limits effective across all Gunicorn workers.
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.getenv("DJANGO_CACHE_URL", "redis://localhost:6379/2"),
        "KEY_PREFIX": "pulsecheck",
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["users.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("RATE_ANON", "120/min"),
        "user": os.getenv("RATE_USER", "600/min"),
        "auth": os.getenv("RATE_AUTH", "30/min"),
        "manual_check": os.getenv("RATE_MANUAL_CHECK", "12/min"),
        "public_status": os.getenv("RATE_PUBLIC_STATUS", "120/min"),
    },
    # Trust forwarded client IP only behind a reverse proxy that overwrites X-Forwarded-For.
    "NUM_PROXIES": env_int("TRUSTED_PROXY_COUNT", 0),
}

JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", SECRET_KEY)
JWT_ALGORITHM = "HS256"
JWT_ISSUER = "pulsecheck"
JWT_AUDIENCE = "pulsecheck-api"
JWT_ACCESS_TOKEN_LIFETIME_SECONDS = env_int("JWT_ACCESS_TOKEN_LIFETIME_SECONDS", 900)
JWT_REFRESH_TOKEN_LIFETIME_SECONDS = env_int("JWT_REFRESH_TOKEN_LIFETIME_SECONDS", 2592000)
JWT_REFRESH_COOKIE_NAME = "pulsecheck_refresh"
JWT_REFRESH_COOKIE_SECURE = env_bool("JWT_REFRESH_COOKIE_SECURE", not DEBUG)
JWT_REFRESH_COOKIE_SAMESITE = os.getenv("JWT_REFRESH_COOKIE_SAMESITE", "Lax")
JWT_REFRESH_COOKIE_PATH = "/api/auth/"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")

DATA_UPLOAD_MAX_MEMORY_SIZE = env_int("DJANGO_MAX_REQUEST_BYTES", 65536)
FILE_UPLOAD_MAX_MEMORY_SIZE = DATA_UPLOAD_MAX_MEMORY_SIZE
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", False)
SECURE_HSTS_SECONDS = env_int("DJANGO_HSTS_SECONDS", 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_REFERRER_POLICY = "same-origin"
if env_bool("DJANGO_TRUST_PROXY_SSL_HEADER", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_TIMEZONE = TIME_ZONE
MONITOR_DISPATCH_BATCH_SIZE = env_int("MONITOR_DISPATCH_BATCH_SIZE", 200)
CHECK_RETENTION_DELETE_BATCH_SIZE = env_int("CHECK_RETENTION_DELETE_BATCH_SIZE", 5000)
CELERY_BEAT_SCHEDULE = {
    "monitor-dispatcher": {
        "task": "monitors.dispatch_due_monitors",
        "schedule": 30.0,
    },
    "check-result-retention": {
        "task": "monitors.purge_expired_check_results",
        "schedule": crontab(hour=3, minute=15),
    },
}
