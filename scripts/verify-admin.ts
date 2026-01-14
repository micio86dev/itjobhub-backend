
import { request } from 'undici';

async function verifyAdmin() {
    try {
        console.log("Logging in...");
        const loginRes = await request('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@test.com', password: 'password123' })
        });

        if (loginRes.statusCode !== 200) {
            console.error(`Login failed: ${loginRes.statusCode}`);
            const text = await loginRes.body.text();
            console.error(text);
            return;
        }

        const loginData = await loginRes.body.json() as any;
        const token = loginData.data?.token;
        if (!token) {
            console.error("No token received");
            return;
        }
        console.log("Login successful, token received.");

        console.log("Fetching stats...");
        const statsRes = await request('http://localhost:3001/admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (statsRes.statusCode !== 200) {
            console.error(`Stats failed: ${statsRes.statusCode}`);
            const text = await statsRes.body.text();
            console.error(text);
        } else {
            const statsData = await statsRes.body.json();
            console.log("Stats fetched successfully:");
            console.log(JSON.stringify(statsData, null, 2).substring(0, 200) + "...");
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

verifyAdmin();
