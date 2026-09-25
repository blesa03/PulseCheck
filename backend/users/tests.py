import pytest
from django.contrib.auth import get_user_model


@pytest.mark.django_db
def test_custom_user_model():
    user_model = get_user_model()

    user = user_model.objects.create_user(
        username="pulsecheck-user",
        password="safe-test-password",
    )

    assert user.username == "pulsecheck-user"
    assert user.check_password("safe-test-password")
