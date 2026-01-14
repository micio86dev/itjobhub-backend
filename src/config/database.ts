
import { dbClient } from "../db/client";

export const setupDatabase = async () => {
  try {
    // Connect to MongoDB
    await dbClient.$connect();
    // eslint-disable-next-line no-console
    console.log("Database connected successfully");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

export { dbClient, dbClient as prisma };
