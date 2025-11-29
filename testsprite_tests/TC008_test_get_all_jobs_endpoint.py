import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_get_all_jobs_endpoint():
    # Define sample query parameters for filtering
    query_params = {
        "page": "1",
        "limit": "10",
        "companyId": "exampleCompanyId123",
        "location": "Remote",
        "seniority": "Senior",
        "remote": "true",
        "skills": "Python,React"
    }

    try:
        response = requests.get(
            f"{BASE_URL}/jobs",
            params=query_params,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Request to /jobs endpoint failed: {e}"

    # Assert the HTTP status code is 200 OK
    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Check for expected keys in the response for pagination and job list
    assert isinstance(data, dict), "Response JSON is not a dictionary"
    assert "data" in data or "jobs" in data, "Response does not contain jobs data"

    # Extract jobs list from possible keys
    jobs_list = data.get("data") or data.get("jobs")
    assert isinstance(jobs_list, list), "Jobs data is not a list"

    # Optionally verify pagination meta if present
    if "meta" in data:
        meta = data["meta"]
        assert isinstance(meta, dict), "Meta field is not a dictionary"
        assert "page" in meta, "Meta does not contain 'page'"
        assert "limit" in meta, "Meta does not contain 'limit'"
        assert "total" in meta, "Meta does not contain 'total'"

    # Validate filtering: Each job should correspond to the filters if jobs are returned
    for job in jobs_list:
        assert isinstance(job, dict), "Each job item should be a dictionary"
        if "companyId" in job and query_params["companyId"]:
            assert job["companyId"] == query_params["companyId"], "Job companyId does not match filter"
        if "location" in job and query_params["location"]:
            # location filter is case-insensitive and possibly partial match
            assert query_params["location"].lower() in job["location"].lower(), "Job location does not match filter"
        if "seniority" in job and query_params["seniority"]:
            # seniority match case insensitive
            assert job.get("seniority", "").lower() == query_params["seniority"].lower(), "Job seniority does not match filter"
        if "remote" in job and query_params["remote"]:
            # remote filter as string "true" or "false" convert to bool
            remote_filter = query_params["remote"].lower() == "true"
            assert job.get("remote") == remote_filter, "Job remote status does not match filter"
        if "skills" in job and query_params["skills"]:
            # skills filter is comma separated string, all should be present in job skills list
            filter_skills = [s.strip().lower() for s in query_params["skills"].split(",")]
            job_skills = [s.lower() for s in job.get("skills", [])]
            for fskill in filter_skills:
                assert fskill in job_skills, f"Job missing required skill: {fskill}"

test_get_all_jobs_endpoint()