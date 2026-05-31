/**
 * Test-safety preload.
 *
 * Runs (via `bunfig.toml` → `[test].preload`) BEFORE any test file or DB
 * client module is imported, so the Prisma / Mongo clients pick up an isolated
 * test database from `process.env.DATABASE_URL`.
 *
 * Why this exists: several tests call `deleteMany({})` with no filter (e.g.
 * `tests/oauth.service.test.ts` wipes ALL users/profiles/comments). Pointed at
 * a real database — which is exactly what happened once, since the husky
 * pre-commit hook runs `bun test` against the `.env` `DATABASE_URL` (the local
 * `itjobhub` dev DB) — that destroys live data.
 *
 * This guard makes the accident structurally impossible: the database name is
 * always forced to a `*_test` sibling, and the run hard-aborts if isolation
 * cannot be guaranteed. The host is left untouched, so an isolated test DB is
 * created next to whatever server `.env`/`.env.test` points at.
 */

const FALLBACK_TEST_URL =
  "mongodb://127.0.0.1:27017/itjobhub_test?replicaSet=rs0&w=1&journal=true";

function forceTestDatabase(): void {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    process.env.DATABASE_URL = FALLBACK_TEST_URL;
    return;
  }

  // mongodb URI: scheme://[user:pass@]host[,host][:port]/[dbname][?options]
  const match = raw.match(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]*)(.*)$/i);
  if (!match) {
    throw new Error(
      `[test-safety] Could not parse DATABASE_URL to enforce a test database — aborting tests rather than risk a real DB.`,
    );
  }

  const [, prefix, dbName, suffix] = match;
  const safeName = /test/i.test(dbName) ? dbName : `${dbName || "itjobhub"}_test`;

  if (!/test/i.test(safeName)) {
    throw new Error(
      `[test-safety] Refusing to run tests against non-test database "${safeName}".`,
    );
  }

  process.env.DATABASE_URL = `${prefix}${safeName}${suffix}`;
}

forceTestDatabase();
