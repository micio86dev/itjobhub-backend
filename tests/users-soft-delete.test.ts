import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma, setupDatabase } from "../src/config/database";
import { getUsers, softDeleteUser } from "../src/services/users/user.service";

/**
 * Regression guard for the prod-31 incident: a `{ deleted_at: null }` filter on
 * `getUsers` returned ZERO rows because Prisma + MongoDB does NOT match
 * documents that are MISSING the field — and every pre-existing user predates
 * the soft-delete column, so the entire admin user list went blank.
 *
 * These tests pin the contract: users WITHOUT the field (and with it null) must
 * still be listed; only users explicitly soft-deleted (deleted_at = a date) are
 * excluded — and the exclusion must compose with the text search.
 */

const MARK = "__softdel_regression__";

describe("getUsers excludes only soft-deleted, never field-missing users", () => {
  let legacyId: string; // doc MISSING deleted_at (pre-existing prod shape)
  let activeId: string; // normal account
  let deletedId: string; // explicitly soft-deleted

  beforeAll(async () => {
    await setupDatabase();

    // Raw insert so the `deleted_at` key is genuinely ABSENT — this is exactly
    // what broke prod; a Prisma create might write an explicit null and hide
    // the regression.
    await prisma.$runCommandRaw({
      insert: "users",
      documents: [
        {
          email: `${MARK}_legacy@x.io`,
          first_name: "Legacy",
          last_name: "User",
          role: "user",
          created_at: { $date: new Date().toISOString() },
        },
      ],
    });
    const legacy = await prisma.user.findUnique({
      where: { email: `${MARK}_legacy@x.io` },
    });
    legacyId = legacy!.id;

    const active = await prisma.user.create({
      data: {
        email: `${MARK}_active@x.io`,
        first_name: "Active",
        last_name: "User",
        role: "user",
      },
    });
    activeId = active.id;

    const del = await prisma.user.create({
      data: {
        email: `${MARK}_deleted@x.io`,
        first_name: "Del",
        last_name: "User",
        role: "user",
      },
    });
    deletedId = del.id;
    await softDeleteUser(deletedId);
  });

  afterAll(async () => {
    // Scoped cleanup (never an unfiltered deleteMany — see preload.ts).
    await prisma.user.deleteMany({ where: { email: { contains: MARK } } });
  });

  it("lists a user whose deleted_at field is MISSING (the prod-31 bug)", async () => {
    const res = await getUsers(1, 200, { q: MARK });
    const ids = res.users.map((u) => u.id);
    expect(ids).toContain(legacyId);
    expect(ids).toContain(activeId);
  });

  it("excludes an explicitly soft-deleted user", async () => {
    const res = await getUsers(1, 200, { q: MARK });
    const ids = res.users.map((u) => u.id);
    expect(ids).not.toContain(deletedId);
  });

  it("the deleted-filter composes with the text search (only 2 visible)", async () => {
    const res = await getUsers(1, 200, { q: MARK });
    expect(res.users.length).toBe(2);
  });
});
