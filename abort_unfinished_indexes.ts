/**
 * abort_unfinished_indexes.ts
 *
 * Runs in the migrations container BEFORE `prisma db push`.
 *
 * Why: `prisma db push --accept-data-loss` syncs the DB to schema.prisma and
 * therefore DROPS every index not declared there. The job scraper creates its
 * own indexes directly on the `jobs` collection (url_unique, dedup_hash_unique,
 * location_geo_2dsphere, ...). On each prod deploy Prisma drops them and the
 * next scraper run recreates them. If a deploy lands while the scraper is still
 * building one of those indexes, the index is "unfinished" and Mongo refuses to
 * drop it:
 *
 *   Error code 27 (IndexNotFound): can't drop unfinished index with name: url_unique
 *
 * ...which fails `db push` and aborts the whole deploy.
 *
 * This script aborts any in-progress index build before `db push` runs, so the
 * push has nothing unfinished to trip over. Aborting an index build removes the
 * partially-built index; the scraper recreates it idempotently on its next run.
 *
 * Best-effort by design: any error is logged and the process exits 0 so it can
 * never make a deploy worse than not running at all. If a build is fully
 * orphaned (no active op), nothing is killed and `db push` will surface the
 * original error — that case needs a `docker restart mongodb`.
 *
 * Requires admin privileges (currentOp / killOp) — the migrations connection
 * uses the Mongo root user, which has them.
 *
 * Run: bun run abort_unfinished_indexes.ts
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const uri = process.env.DATABASE_URL;
if (!uri) {
  console.error("ℹ️  DATABASE_URL not set — skipping unfinished-index abort.");
  process.exit(0);
}

interface IndexBuildOp {
  opid?: unknown;
  ns?: string;
  msg?: string;
  command?: { createIndexes?: string };
}

async function main(): Promise<void> {
  const client = new MongoClient(uri as string);
  await client.connect();

  // $currentOp must run on the admin database and be the first pipeline stage.
  const adminDb = client.db("admin");

  const ops = (await adminDb
    .aggregate([
      { $currentOp: { allUsers: true, idleConnections: false } },
      {
        $match: {
          $or: [
            { "command.createIndexes": { $exists: true } },
            { msg: { $regex: "Index Build", $options: "i" } },
            { desc: { $regex: "IndexBuildsCoordinator", $options: "i" } },
          ],
        },
      },
    ])
    .toArray()) as IndexBuildOp[];

  if (ops.length === 0) {
    console.log("✅ No in-progress index builds — nothing to abort.");
    return;
  }

  console.log(`⚠️  Found ${ops.length} in-progress index build(s):`);
  for (const op of ops) {
    const target = op.ns ?? op.command?.createIndexes ?? "unknown";
    console.log(`   - ns=${target} opid=${String(op.opid)} msg=${op.msg ?? ""}`);
  }

  for (const op of ops) {
    if (op.opid == null) continue;
    try {
      await adminDb.command({ killOp: 1, op: op.opid as number });
      console.log(`   ↳ killOp ${String(op.opid)} sent`);
    } catch (err) {
      console.warn(`   ↳ killOp ${String(op.opid)} failed: ${(err as Error).message}`);
    }
  }

  console.log("✅ Abort pass complete — db push can now drop stale indexes.");
}

main()
  .catch((err) => {
    // Best-effort: never block the deploy. db push will surface any real issue.
    console.warn(`⚠️  abort_unfinished_indexes failed (non-blocking): ${(err as Error).message}`);
  })
  .finally(() => {
    // Force exit so a lingering Mongo socket can't hang the container step.
    process.exit(0);
  });
