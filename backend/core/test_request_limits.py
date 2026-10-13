import pytest
from django.test import Client, override_settings


@pytest.mark.django_db
def test_oversized_json_request_is_rejected():
    with override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=1024):
        response = Client().post(
            "/api/auth/login/",
            data='{"email":"' + ("a" * 2048) + '","password":"test"}',
            content_type="application/json",
        )
    assert response.status_code == 400
