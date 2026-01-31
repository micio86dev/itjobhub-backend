import logger from "./utils/logger";
import { config } from "./config";
import { setupDatabase } from "./config/database";
import { app } from "./app";

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection first
    await setupDatabase();

    // Start the server after database is ready
    app.listen(config.port, () => {
      logger.info(`DevBoards.io API is running on port ${config.port}`);
      logger.info(`Swagger UI available at http://localhost:${config.port}/docs`);
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

startServer();

export type { App } from "./app";
// Triggering reload at Fri Jan  9 18:14:50 WET 2026
// Restarting for Prisma Client update at 2026-01-30
