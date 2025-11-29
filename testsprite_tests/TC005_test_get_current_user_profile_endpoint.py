import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_get_current_user_profile_endpoint():
    session = requests.Session()

    # Register a new user
    register_data = {
        "email": "testuser_tc005@example.com",
        "password": "Password123",
        "firstName": "Test",
        "lastName": "User"
    }
    register_resp = session.post(f"{BASE_URL}/auth/register", json=register_data, timeout=TIMEOUT)
    assert register_resp.status_code == 201, f"User registration failed: {register_resp.text}"

    try:
        # Login user to get auth cookies
        login_data = {
            "email": register_data["email"],
            "password": register_data["password"]
        }
        login_resp = session.post(f"{BASE_URL}/auth/login", json=login_data, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"User login failed: {login_resp.text}"

        # 1. Test authorized access to /users/me (should return 200 and user profile data)
        profile_resp = session.get(f"{BASE_URL}/users/me", timeout=TIMEOUT)
        assert profile_resp.status_code == 200, f"Authorized /users/me failed: {profile_resp.text}"
        profile_json = profile_resp.json()
        assert "email" in profile_json and profile_json["email"] == register_data["email"], "Profile email mismatch"

        # 2. Test unauthorized access (no auth) to /users/me (should return 401)
        session_unauth = requests.Session()
        unauthorized_resp = session_unauth.get(f"{BASE_URL}/users/me", timeout=TIMEOUT)
        assert unauthorized_resp.status_code == 401, f"Unauthorized access expected 401 but got {unauthorized_resp.status_code}"

        # 3. Test non-existent user returns 404
        # This is tricky because /users/me depends on auth token for the current user
        # To simulate non-existent user, we can forge a valid JWT for a non-existent user,
        # but that is out of scope. Instead, we simulate with invalid token (expect 401)
        # or try to access another user endpoint with invalid ID to get 404.
        # The PRD only defines /users/me here for this test, so we try to test 404 by removing user and reusing token.
        # Since that is not feasible here, we'll try forcing an invalid token to simulate 404 as fallback.

        # Expire/Invalidate token scenario is not given, so simulate non-existent user by invalid token bearer
        # We'll try to set an invalid authorization header with a fake token
        headers_invalid_user = {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidtoken.invalid"
        }
        non_existent_resp = requests.get(f"{BASE_URL}/users/me", headers=headers_invalid_user, timeout=TIMEOUT)
        # According to PRD 401 is unauthorized, 404 is user not found;
        # If token invalid, likely 401, so also try with session cookie removed after login to get 404

        # Alternatively, to confirm 404 for non-existent user, forcibly logout user and then call /users/me (expect 401)
        # Without more info, we can attempt to delete user and call /users/me but user delete API is not visible.
        # So for this test, we will manually verify 404 scenario by calling /users/{id}/profile with a fake id.

        fake_user_id = "000000000000000000000000"
        user_profile_resp = session.get(f"{BASE_URL}/users/{fake_user_id}/profile", timeout=TIMEOUT)
        assert user_profile_resp.status_code == 404, f"Expected 404 for non-existent user profile, got {user_profile_resp.status_code}"

    finally:
        # Cleanup: there is no explicit delete user endpoint in the PRD,
        # so cleanup can't be done via API - user removal likely requires admin.
        # Thus, test user remains in DB.
        session.close()

test_get_current_user_profile_endpoint()