import requests
import uuid

BASE_URL = "http://localhost:3001"
TIMEOUT = 30


def test_update_user_profile_endpoint():
    session = requests.Session()
    user_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    user_password = "TestPass123"
    register_url = f"{BASE_URL}/auth/register"
    login_url = f"{BASE_URL}/auth/login"
    update_profile_url = f"{BASE_URL}/users/me/profile"

    headers = {"Content-Type": "application/json"}

    # Register a new user to get authenticated
    register_data = {
        "email": user_email,
        "password": user_password,
        "firstName": "Test",
        "lastName": "User"
    }
    try:
        resp = session.post(register_url, json=register_data, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"User registration failed with status {resp.status_code}"

        # Login user
        login_data = {
            "email": user_email,
            "password": user_password
        }
        resp = session.post(login_url, json=login_data, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"User login failed with status {resp.status_code}"

        # Extract cookies for authenticated requests (JWT tokens in HttpOnly cookies)
        cookies = resp.cookies

        # Update session cookies
        session.cookies.update(cookies)

        # Prepare valid profile update data
        profile_update_data = {
            "languages": ["Python", "JavaScript"],
            "skills": ["REST APIs", "Testing"],
            "seniority": "Senior",
            "availability": "Full-time",
            "bio": "Experienced software developer.",
            "github": "https://github.com/testuser",
            "linkedin": "https://linkedin.com/in/testuser",
            "website": "https://testuser.com",
            "cvUrl": "https://testuser.com/cv.pdf"
        }

        # Test update profile with authentication
        resp = session.put(update_profile_url, json=profile_update_data, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Update profile failed with status {resp.status_code}"

        # Test unauthorized access (without auth cookies)
        resp_unauth = requests.put(update_profile_url, json=profile_update_data, headers=headers, timeout=TIMEOUT)
        assert resp_unauth.status_code == 401, f"Unauthorized update did not return 401 but {resp_unauth.status_code}"
        
    finally:
        # Logout to clean up session
        logout_url = f"{BASE_URL}/auth/logout"
        try:
            session.post(logout_url, timeout=TIMEOUT)
        except Exception:
            pass


test_update_user_profile_endpoint()
