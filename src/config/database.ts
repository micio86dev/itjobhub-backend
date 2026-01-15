import logger from "../utils/logger";
import { dbClient } from "../db/client";

export const setupDatabase = async () => {
  try {
    // Connect to MongoDB
    await dbClient.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.error({ err: error }, "Database connection failed");
    process.exit(1);
  }
};

export { dbClient, dbClient as prisma };
