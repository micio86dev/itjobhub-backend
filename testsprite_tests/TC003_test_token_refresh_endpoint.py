import os
from dotenv import load_dotenv
load_dotenv()
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:3001")
TIMEOUT = 30

def test_token_refresh_endpoint():
    # First, register and login to get a valid refresh token
    register_url = f"{BASE_URL}/auth/register"
    login_url = f"{BASE_URL}/auth/login"
    refresh_url = f"{BASE_URL}/auth/refresh"

    test_email = "testuser_refresh@example.com"
    test_password = "password123"
    first_name = "Test"
    last_name = "Refresh"

    session = requests.Session()
    try:
        # Register user
        register_payload = {
            "email": test_email,
            "password": test_password,
            "firstName": first_name,
            "lastName": last_name
        }
        register_resp = session.post(register_url, json=register_payload, timeout=TIMEOUT)
        if register_resp.status_code not in (201, 400):
            raise AssertionError(f"Unexpected status code on register: {register_resp.status_code}")

        # Login user to get tokens in cookies
        login_payload = {
            "email": test_email,
            "password": test_password
        }
        login_resp = session.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status code {login_resp.status_code}"

        # Extract refresh token cookie
        refresh_token = None
        for cookie in session.cookies:
            if cookie.name.lower() == "refresh_token":
                refresh_token = cookie.value
                break
        # If not found in cookies, try header or JSON, but as per PRD refresh token is HTTPOnly cookie,
        # so we rely on session cookies.
        assert refresh_token is not None, "Refresh token cookie not found after login"

        # Test valid refresh token - POST /auth/refresh with cookie
        refresh_resp = session.post(refresh_url, timeout=TIMEOUT)
        assert refresh_resp.status_code == 200, f"Token refresh failed with status code {refresh_resp.status_code}"

        # Test invalid refresh token - tamper refresh token cookie and expect 401
        original_refresh_token = refresh_token
        session.cookies.set("refresh_token", "invalid_or_expired_token_value")
        refresh_resp_invalid = session.post(refresh_url, timeout=TIMEOUT)
        assert refresh_resp_invalid.status_code == 401, (
            f"Expected 401 for invalid refresh token but got {refresh_resp_invalid.status_code}"
        )

        # Reset back original refresh token in cookie for cleanup
        session.cookies.set("refresh_token", original_refresh_token)

    finally:
        # Cleanup: attempt to delete the created user if such endpoint exists
        # PRD does not mention user deletion endpoint explicitly, so skipping.
        pass

test_token_refresh_endpoint()