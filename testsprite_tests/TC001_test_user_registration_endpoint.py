import os
from dotenv import load_dotenv
load_dotenv()
import requests
import uuid

BASE_URL = os.getenv("BASE_URL", "http://localhost:3001")
REGISTER_ENDPOINT = f"{BASE_URL}/auth/register"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_user_registration_endpoint():
    # Valid input data for registration
    unique_email = f"testuser_{uuid.uuid4()}@example.com"
    valid_payload = {
        "email": unique_email,
        "password": "ValidPass123",
        "firstName": "John",
        "lastName": "Doe"
    }

    # Invalid payloads for testing 400 responses
    invalid_payloads = [
        {},  # empty payload
        {"email": "not-an-email", "password": "123456", "firstName": "A", "lastName": "B"},
        {"email": "missingpassword@example.com", "firstName": "A", "lastName": "B"},
        {"email": unique_email, "password": "short", "firstName": "A", "lastName": "B"},  # password too short
        {"email": unique_email, "password": "ValidPass123", "firstName": "", "lastName": "Doe"},  # empty firstName
        {"email": unique_email, "password": "ValidPass123", "firstName": "John", "lastName": ""},  # empty lastName
    ]

    # Test successful registration
    try:
        response = requests.post(REGISTER_ENDPOINT, json=valid_payload, headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to register valid user failed with exception: {e}"

    assert response.status_code == 201, f"Expected 201 for valid registration, got {response.status_code}"

    # Test invalid inputs, expect 400 Bad Request
    for invalid_body in invalid_payloads:
        try:
            resp = requests.post(REGISTER_ENDPOINT, json=invalid_body, headers=HEADERS, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Request to register with invalid payload {invalid_body} failed with exception: {e}"
        assert resp.status_code == 400, (
            f"Expected 400 for invalid payload {invalid_body}, got {resp.status_code}, response text: {resp.text}"
        )


test_user_registration_endpoint()