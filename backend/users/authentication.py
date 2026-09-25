from django.contrib.auth import get_user_model
from rest_framework.authentication import (
    BaseAuthentication,
    get_authorization_header,
)
from rest_framework.exceptions import AuthenticationFailed

from users.tokens import TokenError, decode_token

User = get_user_model()


class JWTAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()

        if not auth:
            return None

        if auth[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth) != 2:
            raise AuthenticationFailed(
                "Invalid Authorization header.",
            )

        try:
            token = auth[1].decode("utf-8")
        except UnicodeError as exc:
            raise AuthenticationFailed(
                "Invalid access token.",
            ) from exc

        try:
            payload = decode_token(
                token,
                expected_type="access",
            )
        except TokenError as exc:
            raise AuthenticationFailed(
                "Invalid or expired access token.",
            ) from exc

        try:
            user = User.objects.get(
                pk=payload["sub"],
                is_active=True,
            )
        except User.DoesNotExist as exc:
            raise AuthenticationFailed(
                "User not found or inactive.",
            ) from exc

        return user, payload

    def authenticate_header(self, request):
        return self.keyword
