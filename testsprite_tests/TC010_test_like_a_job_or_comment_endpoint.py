import os
from dotenv import load_dotenv
load_dotenv()
import requests
import uuid

BASE_URL = os.getenv("BASE_URL", "http://localhost:3001")
TIMEOUT = 30

def test_like_job_or_comment_endpoint():
    # Helper functions for setup and cleanup
    def register_and_login_user():
        session = requests.Session()
        user_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
        user_password = "TestPass123"
        payload = {
            "email": user_email,
            "password": user_password,
            "firstName": "Test",
            "lastName": "User"
        }
        resp = session.post(f"{BASE_URL}/auth/register", json=payload, timeout=TIMEOUT)
        assert resp.status_code == 201

        login_payload = {"email": user_email, "password": user_password}
        resp_login = session.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
        assert resp_login.status_code == 200
        return session, user_email, user_password

    def delete_like(session, job_id=None, comment_id=None):
        params = {}
        if job_id:
            params["jobId"] = job_id
        if comment_id:
            params["commentId"] = comment_id
        return session.delete(f"{BASE_URL}/likes", params=params, timeout=TIMEOUT)

    # Begin test
    session, user_email, user_password = register_and_login_user()

    # Create necessary resources: company and job
    company_id = None
    job_id = None
    comment_id = None

    try:
        # Create company (some APIs require companyId for job creation)
        resp_comp = session.post(f"{BASE_URL}/companies", json={
            "name": f"TestCompany_{uuid.uuid4().hex[:8]}",
            "description": "Test company to like job comment",
            "website": "https://example.com",
            "logo": "https://example.com/logo.png"
        }, timeout=TIMEOUT)
        assert resp_comp.status_code == 201
        company_resp_json = resp_comp.json()
        company_id = company_resp_json.get("id") or company_resp_json.get("companyId") or None
        assert company_id is not None

        # Create job
        resp_job = session.post(f"{BASE_URL}/jobs", json={
          "title": "Test Job for Likes",
          "description": "Job description for likes testing",
          "companyId": company_id,
          "location": "Remote",
          "salaryMin": 50000,
          "salaryMax": 70000,
          "seniority": "Mid",
          "skills": ["Python", "API"],
          "remote": True
        }, timeout=TIMEOUT)
        assert resp_job.status_code == 201
        job_resp_json = resp_job.json()
        job_id = job_resp_json.get("id") or job_resp_json.get("jobId") or None
        assert job_id is not None

        # Create comment for that job
        resp_comment = session.post(f"{BASE_URL}/comments", json={
            "content": "This is a test comment for likes",
            "jobId": job_id
        }, timeout=TIMEOUT)
        assert resp_comment.status_code == 201
        comment_resp_json = resp_comment.json()
        comment_id = comment_resp_json.get("id") or comment_resp_json.get("commentId") or None
        assert comment_id is not None

        # 1) Test liking a job: POST /likes with jobId
        like_resp = session.post(f"{BASE_URL}/likes", json={"jobId": job_id}, timeout=TIMEOUT)
        assert like_resp.status_code == 200

        # 2) Test duplicate like for same job returns 409
        dup_like_resp = session.post(f"{BASE_URL}/likes", json={"jobId": job_id}, timeout=TIMEOUT)
        assert dup_like_resp.status_code == 409

        # 3) Unlike the job to test next cases cleanly
        del_like_resp = delete_like(session, job_id=job_id)
        assert del_like_resp.status_code == 200

        # 4) Test liking a comment: POST /likes with commentId
        like_comment_resp = session.post(f"{BASE_URL}/likes", json={"commentId": comment_id}, timeout=TIMEOUT)
        assert like_comment_resp.status_code == 200

        # 5) Test duplicate like for same comment returns 409
        dup_like_comment_resp = session.post(f"{BASE_URL}/likes", json={"commentId": comment_id}, timeout=TIMEOUT)
        assert dup_like_comment_resp.status_code == 409

        # 6) Unlike the comment
        del_like_comment_resp = delete_like(session, comment_id=comment_id)
        assert del_like_comment_resp.status_code == 200

        # 7) Test invalid requests to /likes POST: empty payload
        invalid_resp = session.post(f"{BASE_URL}/likes", json={}, timeout=TIMEOUT)
        assert invalid_resp.status_code == 400

        # 8) Test invalid requests: both jobId and commentId missing or null
        invalid_resp2 = session.post(f"{BASE_URL}/likes", json={"jobId": None, "commentId": None}, timeout=TIMEOUT)
        assert invalid_resp2.status_code == 400

        # 9) Invalid data types
        invalid_resp3 = session.post(f"{BASE_URL}/likes", json={"jobId": 123, "commentId": 456}, timeout=TIMEOUT)
        assert invalid_resp3.status_code == 400

    finally:
        # Cleanup: delete likes if exist
        try:
            if job_id:
                delete_like(session, job_id=job_id)
        except Exception:
            pass
        try:
            if comment_id:
                delete_like(session, comment_id=comment_id)
        except Exception:
            pass

        # Cleanup comment
        if comment_id:
            try:
                resp = session.delete(f"{BASE_URL}/comments/{comment_id}", timeout=TIMEOUT)
                assert resp.status_code in (200, 404)
            except Exception:
                pass

        # Cleanup job
        if job_id:
            try:
                resp = session.delete(f"{BASE_URL}/jobs/{job_id}", timeout=TIMEOUT)
                assert resp.status_code in (200, 404)
            except Exception:
                pass

        # Cleanup company
        if company_id:
            try:
                resp = session.delete(f"{BASE_URL}/companies/{company_id}", timeout=TIMEOUT)
                assert resp.status_code in (200, 404)
            except Exception:
                pass


test_like_job_or_comment_endpoint()
