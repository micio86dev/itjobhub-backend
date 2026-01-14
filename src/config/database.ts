/* eslint-disable no-console */
import { dbClient } from "../db/client";

export const setupDatabase = async () => {
  try {
    // Connect to MongoDB
    await dbClient.$connect();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

export { dbClient, dbClient as prisma };
