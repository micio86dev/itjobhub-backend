import os
from dotenv import load_dotenv
load_dotenv()
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:3001")
TIMEOUT = 30


def test_create_job_endpoint():
    # Test data for user registration and login
    user_data = {
        "email": "testuser_tc007@example.com",
        "password": "Password123!",
        "firstName": "Test",
        "lastName": "User"
    }
    # Job data to create
    job_data = {
        "title": "Test Job TC007",
        "description": "Job created during test case TC007",
        "companyId": "000000000000000000000000",  # Placeholder companyId; Adjust if needed
        "location": "Remote",
        "salaryMin": 50000,
        "salaryMax": 70000,
        "seniority": "Mid",
        "skills": ["Python", "Testing"],
        "remote": True
    }

    # Register user
    try:
        resp = requests.post(f"{BASE_URL}/auth/register", json=user_data, timeout=TIMEOUT)
        # It may be 201 Created or 400 if user exists; proceed to login anyways
        assert resp.status_code in (201, 400)
    except Exception as e:
        raise AssertionError(f"User registration request failed: {e}")

    # Login user to get auth cookie
    credentials = {
        "email": user_data["email"],
        "password": user_data["password"]
    }
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json=credentials, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Login failed with status {resp.status_code}"
        # Use session cookies from login response
        session_cookies = resp.cookies
    except Exception as e:
        raise AssertionError(f"User login request failed: {e}")

    # Create a session with cookies for authenticated requests
    session = requests.Session()
    session.cookies.update(session_cookies)

    created_job_id = None

    # Successful authorized job creation test
    try:
        resp = session.post(f"{BASE_URL}/jobs", json=job_data, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Authorized job creation failed with status {resp.status_code}"
        created_job = resp.json()
        created_job_id = created_job.get("id") or created_job.get("_id")
        assert created_job_id, "Created job ID not returned"
    except Exception as e:
        raise AssertionError(f"Authorized job creation request failed: {e}")

    # Unauthorized access test (no auth headers)
    try:
        resp = requests.post(f"{BASE_URL}/jobs", json=job_data, timeout=TIMEOUT)
        assert resp.status_code == 401, f"Unauthorized create job did not return 401, got {resp.status_code}"
    except Exception as e:
        raise AssertionError(f"Unauthorized create job request failed: {e}")

    # Forbidden access test: simulate user with no permission
    # Since roles and permissions are not exposed, simulate by using an invalid or expired token
    headers_forbidden = {
        "Authorization": "Bearer invalid_or_forbidden_token",
        "Content-Type": "application/json"
    }
    try:
        resp = requests.post(f"{BASE_URL}/jobs", json=job_data, headers=headers_forbidden, timeout=TIMEOUT)
        assert resp.status_code == 403 or resp.status_code == 401, f"Forbidden access did not return 403 or 401, got {resp.status_code}"
    except Exception as e:
        raise AssertionError(f"Forbidden create job request failed: {e}")

    # Cleanup: delete created job resource if exists
    if created_job_id:
        try:
            del_resp = session.delete(f"{BASE_URL}/jobs/{created_job_id}", timeout=TIMEOUT)
            # Accept 200 or 204 as success for delete
            assert del_resp.status_code in (200, 204), f"Failed to delete job after test, status {del_resp.status_code}"
        except Exception as e:
            raise AssertionError(f"Cleanup job deletion failed: {e}")


test_create_job_endpoint()
