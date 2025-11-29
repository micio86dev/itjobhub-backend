import requests
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_create_comment_endpoint():
    # Helper user credentials for authentication
    email = f"testuser_{uuid.uuid4()}@example.com"
    password = "TestPass123"
    first_name = "Test"
    last_name = "User"

    # Register a new user
    register_payload = {
        "email": email,
        "password": password,
        "firstName": first_name,
        "lastName": last_name
    }
    register_resp = requests.post(f"{BASE_URL}/auth/register", json=register_payload, timeout=TIMEOUT)
    assert register_resp.status_code == 201, f"User registration failed: {register_resp.text}"

    # Login to get authentication cookies
    login_payload = {
        "email": email,
        "password": password
    }
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"User login failed: {login_resp.text}"

    # Extract cookies for auth
    cookies = login_resp.cookies

    comment_id = None
    try:
        # Test unauthorized access - no cookies
        comment_payload = {
            "content": "This should not be created - unauthorized test"
        }
        unauthorized_resp = requests.post(f"{BASE_URL}/comments", json=comment_payload, timeout=TIMEOUT)
        assert unauthorized_resp.status_code == 401, f"Unauthorized access did not return 401, got {unauthorized_resp.status_code}"

        # Test authenticated comment creation with minimal valid content
        valid_comment_payload = {
            "content": "This is a valid test comment",
            # Optional fields omitted (jobId, parentId)
        }
        create_resp = requests.post(f"{BASE_URL}/comments", json=valid_comment_payload, cookies=cookies, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Failed to create comment, status: {create_resp.status_code}, body: {create_resp.text}"

        # Extract comment ID from response if present for cleanup
        try:
            comment_data = create_resp.json()
            comment_id = comment_data.get("id", None) or comment_data.get("_id", None)
        except Exception:
            comment_id = None

    finally:
        # Cleanup: Delete created comment if possible
        if comment_id:
            del_resp = requests.delete(f"{BASE_URL}/comments/{comment_id}", cookies=cookies, timeout=TIMEOUT)
            # It's okay if deletion is not successful, no assertion to avoid masking test result

        # Logout the user to clean the session and tokens
        try:
            requests.post(f"{BASE_URL}/auth/logout", cookies=cookies, timeout=TIMEOUT)
        except Exception:
            pass

test_create_comment_endpoint()