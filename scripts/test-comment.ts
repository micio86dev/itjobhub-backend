import logger from "../src/utils/logger";

const testComment = async () => {
    const API_URL = process.env.BASE_URL;

    // 1. Login to get token
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'admin@itjobhub.com',
            password: 'AdminPassword123!'
        })
    });

    const loginData = await loginRes.json();
    if (!loginData.success) {
        logger.error({ loginData }, 'Login failed');
        return;
    }

    const token = loginData.data.token;
    logger.info('Logged in successfully');

    // 2. Get a job ID
    const jobsRes = await fetch(`${API_URL}/jobs?limit=1`);
    const jobsData = await jobsRes.json();
    if (!jobsData.success || jobsData.data.jobs.length === 0) {
        logger.error('No jobs found');
        return;
    }

    const jobId = jobsData.data.jobs[0].id;
    logger.info('Testing with Job ID: ' + jobId);

    // 3. Post a comment
    const commentRes = await fetch(`${API_URL}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            content: 'Test comment from script ' + new Date().toISOString(),
            jobId: jobId
        })
    });

    const commentData = await commentRes.json();
    logger.info('Post comment response: ' + JSON.stringify(commentData, null, 2));

    // 4. Test CORS OPTIONS
    logger.info('Testing OPTIONS /comments with Origin...');
    const optionsRes = await fetch(`${API_URL}/comments`, {
        method: 'OPTIONS',
        headers: {
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization'
        }
    });
    logger.info('OPTIONS status: ' + optionsRes.status);
    logger.info('Access-Control-Allow-Origin: ' + optionsRes.headers.get('access-control-allow-origin'));
    logger.info('Access-Control-Allow-Methods: ' + optionsRes.headers.get('access-control-allow-methods'));
    logger.info('Access-Control-Allow-Credentials: ' + optionsRes.headers.get('access-control-allow-credentials'));
};

testComment();
