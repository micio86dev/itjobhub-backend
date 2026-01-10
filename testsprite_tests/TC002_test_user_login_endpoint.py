import os
from dotenv import load_dotenv
load_dotenv()
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:3001")
TIMEOUT = 30

def test_user_login_endpoint():
    login_url = f"{BASE_URL}/auth/login"
    
    valid_credentials = {
        "email": "validuser@example.com",
        "password": "validpassword"
    }
    invalid_credentials = {
        "email": "invaliduser@example.com",
        "password": "wrongpassword"
    }
    
    # Test valid credentials
    try:
        response = requests.post(login_url, json=valid_credentials, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to login endpoint failed with exception: {e}"
    assert response.status_code == 200, f"Expected 200 for valid login, got {response.status_code}"
    try:
        json_response = response.json()
    except ValueError:
        assert False, "Response is not valid JSON on valid login"
    # Check for presence of JWT tokens in response body or cookies
    # Based on PRD, tokens are returned on login (usually in JSON)
    assert "accessToken" in json_response or "access_token" in json_response or "token" in json_response, "JWT access token not found in response for valid login"
    # Optionally check refresh token presence
    # Also typically tokens may be set in HttpOnly cookies, check cookies as fallback
    if not ("accessToken" in json_response or "access_token" in json_response or "token" in json_response):
        cookies = response.cookies
        assert cookies, "No cookies set on valid login"
    
    # Test invalid credentials
    try:
        response_invalid = requests.post(login_url, json=invalid_credentials, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to login endpoint failed with exception: {e}"
    assert response_invalid.status_code == 401, f"Expected 401 for invalid login, got {response_invalid.status_code}"

test_user_login_endpoint()