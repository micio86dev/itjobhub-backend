import logger from "../src/utils/logger";

async function verifyAdmin() {
    try {
        logger.info("Logging in...");
        const loginRes = await fetch('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@test.com', password: 'password123' })
        });

        if (loginRes.status !== 200) {
            logger.error(`Login failed: ${loginRes.status}`);
            const text = await loginRes.text();
            logger.error(text);
            return;
        }

        const loginData = await loginRes.json() as any;
        const token = loginData.data?.token;
        if (!token) {
            logger.error("No token received");
            return;
        }
        logger.info("Login successful, token received.");

        logger.info("Fetching stats...");
        const statsRes = await fetch('http://localhost:3001/admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (statsRes.status !== 200) {
            logger.error(`Stats failed: ${statsRes.status}`);
            const text = await statsRes.text();
            logger.error(text);
        } else {
            const statsData = await statsRes.json();
            logger.info("Stats fetched successfully:");
            logger.info(JSON.stringify(statsData, null, 2).substring(0, 200) + "...");
        }

    } catch (err) {
        logger.error({ err }, "Error in verifyAdmin");
    }
}

verifyAdmin();
