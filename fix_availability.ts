/**
 * fix_availability.ts
 *
 * Migrates UserProfile.availability from a single string to a string[] so the
 * profile can hold multiple preferred employment types. Runs in the migrations
 * container BEFORE the new backend (which expects string[]) starts.
 *
 * - string value  -> [value]
 * - null / absent  -> []
 * - already array  -> left as-is (idempotent)
 *
 * Run: bun run fix_availability.ts
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const uri = process.env.DATABASE_URL;
if (!uri) {
  console.error("ℹ️  DATABASE_URL not set — skipping availability migration.");
  process.exit(0);
}

async function main(): Promise<void> {
  const client = new MongoClient(uri as string);
  await client.connect();
  const profiles = client.db().collection("user_profiles");

  // Anything where availability is NOT already an array (string, null, missing).
  const cursor = profiles.find({ availability: { $not: { $type: "array" } } });
  let scalarToArray = 0;
  let nulledToEmpty = 0;

  for await (const doc of cursor) {
    const value = doc.availability;
    const next = typeof value === "string" && value.trim() ? [value] : [];
    if (next.length) scalarToArray += 1;
    else nulledToEmpty += 1;
    await profiles.updateOne({ _id: doc._id }, { $set: { availability: next } });
  }

  console.log(
    `✅ availability migrated: ${scalarToArray} scalar→array, ${nulledToEmpty} null/absent→[].`,
  );
}

main()
  .catch((err) => {
    // Non-blocking: log and continue so a transient failure can't abort deploy.
    console.warn(`⚠️  fix_availability failed (non-blocking): ${(err as Error).message}`);
  })
  .finally(() => process.exit(0));
