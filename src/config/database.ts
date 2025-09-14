import { dbClient } from "../db/client";

export const setupDatabase = async () => {
  try {
    // Connect to Cassandra and initialize schema
    await dbClient.connect();
    await dbClient.initializeSchema();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

// Export db client for backward compatibility
export const prisma = new Proxy({} as any, {
  get(_, prop) {
    return dbClient.db[prop as keyof typeof dbClient.db];
  },
});
export { dbClient };
