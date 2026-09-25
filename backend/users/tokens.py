import hashlib
import uuid
from dataclasses import dataclass
from datetime import timedelta

import jwt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from users.models import RefreshToken, User


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class TokenPair:
    access: str
    refresh: str
    user: User


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8"),
    ).hexdigest()


def _encode_token(
    *,
    user: User,
    token_type: str,
    lifetime_seconds: int,
) -> tuple[str, uuid.UUID, timezone.datetime]:
    issued_at = timezone.now()
    expires_at = issued_at + timedelta(
        seconds=lifetime_seconds,
    )

    jti = uuid.uuid4()

    payload = {
        "sub": str(user.pk),
        "type": token_type,
        "jti": str(jti),
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    }

    token = jwt.encode(
        payload,
        settings.JWT_SIGNING_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    return token, jti, expires_at


def decode_token(
    token: str,
    *,
    expected_type: str,
) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SIGNING_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={
                "require": [
                    "sub",
                    "type",
                    "jti",
                    "iat",
                    "exp",
                    "iss",
                    "aud",
                ],
            },
        )
    except jwt.PyJWTError as exc:
        raise TokenError(
            "Invalid or expired token.",
        ) from exc

    if payload.get("type") != expected_type:
        raise TokenError(
            "Invalid token type.",
        )

    return payload


def issue_token_pair(user: User) -> TokenPair:
    access, _, _ = _encode_token(
        user=user,
        token_type="access",
        lifetime_seconds=(settings.JWT_ACCESS_TOKEN_LIFETIME_SECONDS),
    )

    refresh, refresh_jti, refresh_expires_at = _encode_token(
        user=user,
        token_type="refresh",
        lifetime_seconds=(settings.JWT_REFRESH_TOKEN_LIFETIME_SECONDS),
    )

    RefreshToken.objects.create(
        user=user,
        jti=refresh_jti,
        token_hash=hash_refresh_token(refresh),
        expires_at=refresh_expires_at,
    )

    return TokenPair(
        access=access,
        refresh=refresh,
        user=user,
    )


def rotate_refresh_token(
    raw_token: str,
) -> TokenPair:
    payload = decode_token(
        raw_token,
        expected_type="refresh",
    )

    token_hash = hash_refresh_token(raw_token)

    with transaction.atomic():
        try:
            stored_token = (
                RefreshToken.objects.select_for_update()
                .select_related("user")
                .get(
                    token_hash=token_hash,
                    jti=payload["jti"],
                    user_id=payload["sub"],
                )
            )
        except RefreshToken.DoesNotExist as exc:
            raise TokenError(
                "Refresh token is not recognized.",
            ) from exc

        now = timezone.now()

        if stored_token.revoked_at is not None:
            raise TokenError(
                "Refresh token has been revoked.",
            )

        if stored_token.expires_at <= now:
            raise TokenError(
                "Refresh token has expired.",
            )

        if not stored_token.user.is_active:
            raise TokenError(
                "User account is inactive.",
            )

        stored_token.revoked_at = now
        stored_token.save(
            update_fields=["revoked_at"],
        )

        return issue_token_pair(
            stored_token.user,
        )


def revoke_refresh_token(
    raw_token: str,
) -> None:
    RefreshToken.objects.filter(
        token_hash=hash_refresh_token(raw_token),
        revoked_at__isnull=True,
    ).update(
        revoked_at=timezone.now(),
    )
