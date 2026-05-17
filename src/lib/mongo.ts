import { MongoClient, type Db } from "mongodb";
import logger from "../utils/logger";

/**
 * Shared `MongoClient` instance for raw aggregations against collections
 * written outside the Prisma surface (e.g. `import_reports`, `import_runs`
 * authored by the scraper).
 *
 * Reuses the same `DATABASE_URL` the Prisma client points at so we always
 * talk to the same logical database.
 */

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — required for the shared MongoClient"
    );
  }
  return url;
};

const extractDbName = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\//, "");
    const dbName = pathname.split("?")[0];
    return dbName || undefined;
  } catch {
    return undefined;
  }
};

export const getMongoClient = async (): Promise<MongoClient> => {
  if (client) return client;
  if (connectPromise) return connectPromise;

  const url = getDatabaseUrl();
  connectPromise = (async () => {
    const newClient = new MongoClient(url);
    try {
      await newClient.connect();
      logger.info("Shared MongoClient connected");
      client = newClient;
      return newClient;
    } catch (error) {
      logger.error({ err: error }, "Shared MongoClient connection failed");
      connectPromise = null;
      throw error;
    }
  })();

  return connectPromise;
};

export const getMongoDb = async (): Promise<Db> => {
  const c = await getMongoClient();
  const dbName = extractDbName(getDatabaseUrl());
  return dbName ? c.db(dbName) : c.db();
};

export const closeMongoClient = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    connectPromise = null;
  }
};
