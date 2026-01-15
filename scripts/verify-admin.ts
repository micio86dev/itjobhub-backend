
import { request } from 'undici';
import logger from "../src/utils/logger";

async function verifyAdmin() {
    try {
        logger.info("Logging in...");
        const loginRes = await request('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@test.com', password: 'password123' })
        });

        if (loginRes.statusCode !== 200) {
            logger.error(`Login failed: ${loginRes.statusCode}`);
            const text = await loginRes.body.text();
            logger.error(text);
            return;
        }

        const loginData = await loginRes.body.json() as any;
        const token = loginData.data?.token;
        if (!token) {
            logger.error("No token received");
            return;
        }
        logger.info("Login successful, token received.");

        logger.info("Fetching stats...");
        const statsRes = await request('http://localhost:3001/admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (statsRes.statusCode !== 200) {
            logger.error(`Stats failed: ${statsRes.statusCode}`);
            const text = await statsRes.body.text();
            logger.error(text);
        } else {
            const statsData = await statsRes.body.json();
            logger.info("Stats fetched successfully:");
            logger.info(JSON.stringify(statsData, null, 2).substring(0, 200) + "...");
        }

    } catch (err) {
        logger.error({ err }, "Error in verifyAdmin");
    }
}

verifyAdmin();
