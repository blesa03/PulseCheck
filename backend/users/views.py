from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from users.cookies import (
    clear_refresh_cookie,
    set_refresh_cookie,
)
from users.serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)
from users.tokens import (
    TokenError,
    issue_token_pair,
    revoke_refresh_token,
    rotate_refresh_token,
)


def build_auth_response(
    *,
    user,
    status_code: int,
):
    token_pair = issue_token_pair(user)

    response = Response(
        {
            "access": token_pair.access,
            "user": UserSerializer(
                token_pair.user,
            ).data,
        },
        status=status_code,
    )

    set_refresh_cookie(
        response,
        token_pair.refresh,
    )

    return response


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(
            data=request.data,
        )

        serializer.is_valid(
            raise_exception=True,
        )

        user = serializer.save()

        return build_auth_response(
            user=user,
            status_code=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(
            data=request.data,
            context={
                "request": request,
            },
        )

        serializer.is_valid(
            raise_exception=True,
        )

        return build_auth_response(
            user=serializer.validated_data["user"],
            status_code=status.HTTP_200_OK,
        )


class RefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(
            settings.JWT_REFRESH_COOKIE_NAME,
        )

        if not raw_token:
            return Response(
                {
                    "detail": ("Refresh token is missing."),
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            token_pair = rotate_refresh_token(
                raw_token,
            )
        except TokenError:
            response = Response(
                {
                    "detail": ("Refresh token is invalid or expired."),
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

            clear_refresh_cookie(response)

            return response

        response = Response(
            {
                "access": token_pair.access,
                "user": UserSerializer(
                    token_pair.user,
                ).data,
            },
            status=status.HTTP_200_OK,
        )

        set_refresh_cookie(
            response,
            token_pair.refresh,
        )

        return response


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(
            settings.JWT_REFRESH_COOKIE_NAME,
        )

        if raw_token:
            revoke_refresh_token(
                raw_token,
            )

        response = Response(
            status=status.HTTP_204_NO_CONTENT,
        )

        clear_refresh_cookie(response)

        return response


class MeView(APIView):
    def get(self, request):
        return Response(
            UserSerializer(
                request.user,
            ).data,
        )
