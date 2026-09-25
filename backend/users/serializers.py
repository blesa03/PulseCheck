from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import (
    validate_password,
)
from django.core.exceptions import ValidationError
from rest_framework import serializers

from users.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "date_joined",
        )
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate_email(self, value):
        email = User.objects.normalize_user_email(
            value,
        )

        if User.objects.filter(
            email__iexact=email,
        ).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.",
            )

        return email

    def validate(self, attrs):
        password = attrs["password"]
        password_confirm = attrs["password_confirm"]

        if password != password_confirm:
            raise serializers.ValidationError(
                {
                    "password_confirm": ("Passwords do not match."),
                }
            )

        candidate_user = User(
            email=attrs["email"],
        )

        try:
            validate_password(
                password,
                user=candidate_user,
            )
        except ValidationError as exc:
            raise serializers.ValidationError(
                {
                    "password": list(
                        exc.messages,
                    ),
                }
            ) from exc

        return attrs

    def create(self, validated_data):
        validated_data.pop(
            "password_confirm",
        )

        return User.objects.create_user(
            **validated_data,
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        email = User.objects.normalize_user_email(
            attrs["email"],
        )

        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=attrs["password"],
        )

        if user is None:
            raise serializers.ValidationError(
                {
                    "detail": ("Invalid email or password."),
                }
            )

        attrs["user"] = user

        return attrs
