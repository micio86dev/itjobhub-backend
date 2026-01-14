
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
        console.error('Login failed', loginData);
        return;
    }

    const token = loginData.data.token;
    console.log('Logged in successfully');

    // 2. Get a job ID
    const jobsRes = await fetch(`${API_URL}/jobs?limit=1`);
    const jobsData = await jobsRes.json();
    if (!jobsData.success || jobsData.data.jobs.length === 0) {
        console.error('No jobs found');
        return;
    }

    const jobId = jobsData.data.jobs[0].id;
    console.log('Testing with Job ID:', jobId);

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
    console.log('Post comment response:', JSON.stringify(commentData, null, 2));

    // 4. Test CORS OPTIONS
    console.log('Testing OPTIONS /comments with Origin...');
    const optionsRes = await fetch(`${API_URL}/comments`, {
        method: 'OPTIONS',
        headers: {
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization'
        }
    });
    console.log('OPTIONS status:', optionsRes.status);
    console.log('Access-Control-Allow-Origin:', optionsRes.headers.get('access-control-allow-origin'));
    console.log('Access-Control-Allow-Methods:', optionsRes.headers.get('access-control-allow-methods'));
    console.log('Access-Control-Allow-Credentials:', optionsRes.headers.get('access-control-allow-credentials'));
};

testComment();
