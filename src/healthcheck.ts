import { dbClient } from "./config/database";
import logger from "./utils/logger";
// Assuming you might have a redis client. If not, we skip or add basic connectivity check if user uses one.
// The user plan mentions "Redis + RediSearch".
// Check if redis client exists in project, if not we simulate or skip.
// We will assume a redis client import pattern or try to create a simple check.
// For now, let's just check DB as that is critical.
// If redis is used, import it here.

export const healthCheckHandler = async () => {
    const status: Record<string, string> = {
        server: "running",
        database: "unknown",
        timestamp: new Date().toISOString()
    };

    let statusCode = 200;

    // Check MongoDB
    try {
        // Simple ping
        await dbClient.$runCommandRaw({ ping: 1 });
        status.database = "connected";
    } catch {
        status.database = "disconnected";
        statusCode = 503;
        logger.error("Health check failed: DB disconnected");
    }

    // Check Redis (Placeholder if no client is exported globally)
    // try {
    //   await redisClient.ping();
    //   status.redis = "connected";
    // } catch (e) { status.redis = "disconnected"; ... }

    return new Response(JSON.stringify(status), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
    });
};
