import pytest
from django.conf import settings
from rest_framework.test import APIClient

from users.models import RefreshToken, User
from users.tokens import hash_refresh_token

PASSWORD = "Rugged-Pulse-2026!"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="user@example.com",
        password=PASSWORD,
    )


@pytest.mark.django_db
def test_register_creates_user_and_token_pair(client):
    response = client.post(
        "/api/auth/register/",
        {
            "email": "User@Example.com",
            "password": PASSWORD,
            "password_confirm": PASSWORD,
        },
        format="json",
    )

    assert response.status_code == 201

    assert response.data["user"]["email"] == ("user@example.com")

    assert response.data["access"]

    created_user = User.objects.get()

    assert created_user.email == "user@example.com"

    cookie = response.cookies[settings.JWT_REFRESH_COOKIE_NAME]

    assert cookie["httponly"]
    assert cookie["samesite"] == (settings.JWT_REFRESH_COOKIE_SAMESITE)

    stored_token = RefreshToken.objects.get(
        user=created_user,
    )

    assert stored_token.token_hash == (hash_refresh_token(cookie.value))

    assert stored_token.token_hash != cookie.value


@pytest.mark.django_db
def test_register_rejects_duplicate_email_case_insensitive(
    client,
    user,
):
    response = client.post(
        "/api/auth/register/",
        {
            "email": "USER@EXAMPLE.COM",
            "password": PASSWORD,
            "password_confirm": PASSWORD,
        },
        format="json",
    )

    assert response.status_code == 400
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_login_returns_access_and_refresh_cookie(
    client,
    user,
):
    response = client.post(
        "/api/auth/login/",
        {
            "email": "USER@EXAMPLE.COM",
            "password": PASSWORD,
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["user"]["email"] == ("user@example.com")

    assert settings.JWT_REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.django_db
def test_login_rejects_invalid_credentials(
    client,
    user,
):
    response = client.post(
        "/api/auth/login/",
        {
            "email": "user@example.com",
            "password": "wrong-password",
        },
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_me_requires_access_token(
    client,
):
    response = client.get(
        "/api/auth/me/",
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_authenticated_user(
    client,
    user,
):
    login_response = client.post(
        "/api/auth/login/",
        {
            "email": user.email,
            "password": PASSWORD,
        },
        format="json",
    )

    access = login_response.data["access"]

    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
    )

    response = client.get(
        "/api/auth/me/",
    )

    assert response.status_code == 200
    assert response.data["email"] == user.email


@pytest.mark.django_db
def test_refresh_rotates_refresh_token(
    client,
    user,
):
    login_response = client.post(
        "/api/auth/login/",
        {
            "email": user.email,
            "password": PASSWORD,
        },
        format="json",
    )

    old_raw_token = login_response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    old_token = RefreshToken.objects.get(
        token_hash=hash_refresh_token(
            old_raw_token,
        ),
    )

    response = client.post(
        "/api/auth/refresh/",
        {},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["access"]

    old_token.refresh_from_db()

    assert old_token.revoked_at is not None

    new_raw_token = response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    assert new_raw_token != old_raw_token

    assert (
        RefreshToken.objects.filter(
            user=user,
            revoked_at__isnull=True,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_revoked_refresh_token_cannot_be_reused(
    client,
    user,
):
    login_response = client.post(
        "/api/auth/login/",
        {
            "email": user.email,
            "password": PASSWORD,
        },
        format="json",
    )

    old_raw_token = login_response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    first_refresh = client.post(
        "/api/auth/refresh/",
        {},
        format="json",
    )

    assert first_refresh.status_code == 200

    client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = old_raw_token

    replay_response = client.post(
        "/api/auth/refresh/",
        {},
        format="json",
    )

    assert replay_response.status_code == 401


@pytest.mark.django_db
def test_logout_revokes_refresh_token(
    client,
    user,
):
    login_response = client.post(
        "/api/auth/login/",
        {
            "email": user.email,
            "password": PASSWORD,
        },
        format="json",
    )

    raw_token = login_response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    response = client.post(
        "/api/auth/logout/",
        {},
        format="json",
    )

    assert response.status_code == 204

    stored_token = RefreshToken.objects.get(
        token_hash=hash_refresh_token(
            raw_token,
        ),
    )

    assert stored_token.revoked_at is not None
