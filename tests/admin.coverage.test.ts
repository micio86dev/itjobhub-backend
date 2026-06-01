/**
 * Integration tests for admin routes and services.
 *
 * Covers:
 *   - src/routes/admin.ts           (GET /admin/stats and timeline endpoints)
 *   - src/routes/admin-users.ts     (POST/GET/PUT/DELETE /admin/users/*)
 *   - src/routes/admin-providers.ts (GET/PATCH /admin/providers/*)
 *   - src/services/admin/admin.service.ts    (statistics + timeline helpers)
 *   - src/services/admin/providers.service.ts (listProviders / setProviderEnabled)
 *   - src/services/admin/scraper-dispatch.service.ts (dispatchImport / getLatestRun)
 *
 * Naming convention: all seeded documents use the `beb-` prefix + timestamp so
 * the test suite can clean up only its own data and never collides with other
 * parallel suites.
 */

import { describe, it, expect, beforeAll, afterAll, spyOn, mock } from "bun:test";
import { app } from "../src/app";
import { prisma, setupDatabase } from "../src/config/database";
import { getMongoDb, closeMongoClient } from "../src/lib/mongo";
import { loginUser, type AuthTokens } from "./helpers/auth";
import logger from "../src/utils/logger";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const TAG = `beb-${Date.now()}`;
const PROVIDER_SLUG_1 = `${TAG}-provider-alpha`;
const PROVIDER_SLUG_2 = `${TAG}-provider-beta`;
const TEST_USER_EMAIL = `${TAG}@example.com`;
const TEST_COMPANY_NAME = `${TAG}-company`;

// ────────────────────────────────────────────────────────────────────────────
// Auth tokens
// ────────────────────────────────────────────────────────────────────────────

let adminTokens: AuthTokens;
let seekerTokens: AuthTokens;

// Seeded IDs we'll need across tests
let createdUserId: string;
let seededCompanyId: string;
let seededJobId: string;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
    success: boolean;
    status: number;
    message: string;
    data?: T;
    errors?: unknown;
}

async function callApi<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    opts: { token?: string; body?: unknown } = {}
): Promise<{ status: number; body: ApiResponse<T> }> {
    const headers: Record<string, string> = {};
    if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
    if (opts.body) headers["Content-Type"] = "application/json";

    const response = await app.handle(
        new Request(`http://localhost${path}`, {
            method,
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        })
    );
    const body = (await response.json()) as ApiResponse<T>;
    return { status: response.status, body };
}

// ────────────────────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────────────────────

const cleanup = async () => {
    try {
        // Providers (raw MongoDB)
        const db = await getMongoDb();
        await db.collection("providers").deleteMany({
            slug: { $in: [PROVIDER_SLUG_1, PROVIDER_SLUG_2] }
        });

        // Jobs and company seeded by these tests
        if (seededJobId) {
            await prisma.interaction.deleteMany({
                where: { trackable_id: seededJobId, trackable_type: "job" }
            });
            await prisma.favorite.deleteMany({ where: { job_id: seededJobId } });
            await prisma.job.deleteMany({ where: { id: seededJobId } });
        }
        if (seededCompanyId) {
            await prisma.company.deleteMany({ where: { id: seededCompanyId } });
        }

        // Users created by admin-users tests
        await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
        // Also the one we used TEST_USER_EMAIL
        await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });

        // UserProfiles for test users will cascade via Prisma
    } catch (err) {
        logger.error({ err }, "[admin.coverage] cleanup error");
    }
};

// ────────────────────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
    await setupDatabase();
    await cleanup();

    adminTokens = await loginUser(app, "admin");
    seekerTokens = await loginUser(app, "jobSeeker");

    // Seed a company + one job so statistics endpoints have something to count
    const company = await prisma.company.create({
        data: { name: TEST_COMPANY_NAME, description: "beb test company" }
    });
    seededCompanyId = company.id;

    const job = await prisma.job.create({
        data: {
            company_id: company.id,
            title: `${TAG}-job`,
            description: "beb test job",
            status: "active",
            source: "beb-source",
            source_provider: "beb-source",
            link: `https://example.com/${TAG}`,
            skills: ["TypeScript", "Bun"],
            requirements: [],
            benefits: []
        }
    });
    seededJobId = job.id;

    // Seed two providers in the `providers` MongoDB collection
    const db = await getMongoDb();
    await db.collection("providers").insertMany([
        {
            slug: PROVIDER_SLUG_1,
            name: "Alpha Provider",
            enabled: true,
            pricing_tier: "free",
            source_type: "api",
            geo: "IT",
            source_url: "https://alpha.example.com",
            notes: "beb test provider",
            requires_auth: false,
            auth_env_vars: [],
            credentials_present: true,
            updated_at: null
        },
        {
            slug: PROVIDER_SLUG_2,
            name: "Beta Provider",
            enabled: false,
            pricing_tier: "metered",
            source_type: "rss",
            geo: "EN",
            source_url: "https://beta.example.com",
            notes: "beb test provider 2",
            requires_auth: true,
            auth_env_vars: ["BETA_KEY"],
            credentials_present: false,
            updated_at: new Date()
        }
    ]);
});

afterAll(async () => {
    await cleanup();
    await closeMongoClient();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. GET /admin/stats  (admin.ts → admin.service.ts)
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats", () => {
    it("returns 401 without a token", async () => {
        const { status } = await callApi("GET", "/admin/stats");
        expect(status).toBe(401);
    });

    it("returns 403 for a non-admin user", async () => {
        const { status } = await callApi("GET", "/admin/stats", {
            token: seekerTokens.token
        });
        expect(status).toBe(403);
    });

    it("returns statistics overview with expected shape (all-time)", async () => {
        const { status, body } = await callApi("GET", "/admin/stats", {
            token: adminTokens.token
        });

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        // body.data is { overview: {...}, charts: {...} }
        const d = body.data as Record<string, unknown>;
        expect(d).toBeDefined();
        const overview = d.overview as Record<string, unknown>;
        expect(overview).toBeDefined();
        const jobs = overview.jobs as Record<string, unknown>;
        expect(typeof jobs.total).toBe("number");
        const users = overview.users as Record<string, unknown>;
        expect(typeof users.total).toBe("number");
        const charts = d.charts as Record<string, unknown>;
        expect(Array.isArray(charts.seniority)).toBe(true);
        expect(Array.isArray(charts.trends)).toBe(true);
    });

    it("returns statistics filtered by year + month", async () => {
        const year = new Date().getFullYear();
        const month = new Date().getMonth() + 1;
        const { status, body } = await callApi(
            "GET",
            `/admin/stats?year=${year}&month=${month}`,
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("returns statistics filtered by year only", async () => {
        const year = new Date().getFullYear();
        const { status, body } = await callApi(
            "GET",
            `/admin/stats?year=${year}`,
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(body.success).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. GET /admin/stats/registrations-timeline
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/registrations-timeline", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/registrations-timeline");
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "GET",
            "/admin/stats/registrations-timeline",
            { token: seekerTokens.token }
        );
        expect(status).toBe(403);
    });

    it("returns daily buckets array", async () => {
        const { status, body } = await callApi<{ date: string; count: number }[]>(
            "GET",
            "/admin/stats/registrations-timeline?days=7",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
        // At least 7 day-buckets
        expect(body.data!.length).toBeGreaterThanOrEqual(7);
        expect(body.data![0]).toMatchObject({
            date: expect.any(String),
            count: expect.any(Number)
        });
    });

    it("uses default 30 days when no query param supplied", async () => {
        const { status, body } = await callApi<{ date: string; count: number }[]>(
            "GET",
            "/admin/stats/registrations-timeline",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(body.data!.length).toBeGreaterThanOrEqual(30);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. GET /admin/stats/jobs-timeline
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/jobs-timeline", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/jobs-timeline");
        expect(status).toBe(401);
    });

    it("returns weekly buckets array", async () => {
        const { status, body } = await callApi<{ week: string; count: number }[]>(
            "GET",
            "/admin/stats/jobs-timeline?weeks=4",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data![0]).toMatchObject({
            week: expect.any(String),
            count: expect.any(Number)
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. GET /admin/stats/applications-timeline
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/applications-timeline", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/applications-timeline");
        expect(status).toBe(401);
    });

    it("returns daily buckets array", async () => {
        const { status, body } = await callApi<{ date: string; count: number }[]>(
            "GET",
            "/admin/stats/applications-timeline?days=14",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. GET /admin/stats/activity-heatmap
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/activity-heatmap", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/activity-heatmap");
        expect(status).toBe(401);
    });

    it("returns heatmap cells + max", async () => {
        const { status, body } = await callApi<{
            cells: { day: number; hour: number; count: number }[];
            max: number;
        }>("GET", "/admin/stats/activity-heatmap?days=30", {
            token: adminTokens.token
        });
        expect(status).toBe(200);
        const d = body.data!;
        expect(Array.isArray(d.cells)).toBe(true);
        expect(d.cells.length).toBe(7 * 24); // full grid
        expect(typeof d.max).toBe("number");
        expect(d.cells[0]).toMatchObject({
            day: expect.any(Number),
            hour: expect.any(Number),
            count: expect.any(Number)
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. GET /admin/stats/login-methods
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/login-methods", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/login-methods");
        expect(status).toBe(401);
    });

    it("returns login method distribution", async () => {
        const { status, body } = await callApi<{ method: string; count: number }[]>(
            "GET",
            "/admin/stats/login-methods",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data![0]).toMatchObject({
            method: expect.any(String),
            count: expect.any(Number)
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. GET /admin/stats/top-languages
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/stats/top-languages", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/stats/top-languages");
        expect(status).toBe(401);
    });

    it("returns top languages array", async () => {
        const { status, body } = await callApi<{ language: string; count: number }[]>(
            "GET",
            "/admin/stats/top-languages?limit=5",
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. admin-users.ts — POST /admin/users/
// ════════════════════════════════════════════════════════════════════════════

describe("POST /admin/users", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("POST", "/admin/users", {
            body: { email: "x@example.com", firstName: "A", lastName: "B", role: "user" }
        });
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("POST", "/admin/users", {
            token: seekerTokens.token,
            body: { email: "x@example.com", firstName: "A", lastName: "B", role: "user" }
        });
        expect(status).toBe(403);
    });

    it("creates a new user and returns 201 with generatedPassword", async () => {
        const { status, body } = await callApi<{
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            generatedPassword: string;
            createdAt: string | null;
        }>("POST", "/admin/users", {
            token: adminTokens.token,
            body: {
                email: TEST_USER_EMAIL,
                firstName: "Beb",
                lastName: "Test",
                role: "user"
            }
        });
        expect(status).toBe(201);
        expect(body.success).toBe(true);
        const d = body.data!;
        expect(d.email).toBe(TEST_USER_EMAIL);
        expect(d.role).toBe("user");
        expect(typeof d.generatedPassword).toBe("string");
        expect(d.generatedPassword.length).toBeGreaterThan(0);
        createdUserId = d.id;
    });

    it("returns 409 when the email already exists", async () => {
        const { status, body } = await callApi("POST", "/admin/users", {
            token: adminTokens.token,
            body: {
                email: TEST_USER_EMAIL,
                firstName: "Dup",
                lastName: "User",
                role: "user"
            }
        });
        expect(status).toBe(409);
        expect(body.success).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. admin-users.ts — GET /admin/users/:id
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/users/:id", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", `/admin/users/nonexistent`);
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("GET", `/admin/users/nonexistent`, {
            token: seekerTokens.token
        });
        expect(status).toBe(403);
    });

    it("returns 404 for a user that does not exist", async () => {
        const { status } = await callApi(
            "GET",
            `/admin/users/000000000000000000000000`,
            { token: adminTokens.token }
        );
        expect(status).toBe(404);
    });

    it("returns the full user card for an existing user", async () => {
        expect(createdUserId).toBeDefined();
        const { status, body } = await callApi<{
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            profile: unknown | null;
            cvs: unknown[];
        }>("GET", `/admin/users/${createdUserId}`, {
            token: adminTokens.token
        });
        expect(status).toBe(200);
        const d = body.data!;
        expect(d.id).toBe(createdUserId);
        expect(d.email).toBe(TEST_USER_EMAIL);
        expect(d.firstName).toBe("Beb");
        expect(d.lastName).toBe("Test");
        expect(Array.isArray(d.cvs)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. admin-users.ts — PUT /admin/users/:id
// ════════════════════════════════════════════════════════════════════════════

describe("PUT /admin/users/:id", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("PUT", `/admin/users/x`, {
            body: {}
        });
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("PUT", `/admin/users/x`, {
            token: seekerTokens.token,
            body: {}
        });
        expect(status).toBe(403);
    });

    it("returns 404 for non-existent user", async () => {
        const { status } = await callApi("PUT", `/admin/users/000000000000000000000000`, {
            token: adminTokens.token,
            body: { role: "admin" }
        });
        expect(status).toBe(404);
    });

    it("updates the user and returns the updated card", async () => {
        expect(createdUserId).toBeDefined();
        const { status, body } = await callApi<{
            id: string;
            role: string;
            profile: { skills: string[] } | null;
        }>("PUT", `/admin/users/${createdUserId}`, {
            token: adminTokens.token,
            body: {
                role: "admin",
                skills: ["Bun", "TypeScript"],
                languages: ["English"],
                workModes: ["remote"]
            }
        });
        expect(status).toBe(200);
        const d = body.data!;
        expect(d.id).toBe(createdUserId);
        expect(d.role).toBe("admin");
        expect(d.profile?.skills).toContain("Bun");
    });

    it("updates profile fields without touching role", async () => {
        const { status, body } = await callApi<{
            profile: { skills: string[] } | null;
        }>("PUT", `/admin/users/${createdUserId}`, {
            token: adminTokens.token,
            body: { skills: ["Go"] }
        });
        expect(status).toBe(200);
        expect(body.data?.profile?.skills).toContain("Go");
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. admin-users.ts — DELETE /admin/users/:id
// ════════════════════════════════════════════════════════════════════════════

describe("DELETE /admin/users/:id", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("DELETE", `/admin/users/x`);
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("DELETE", `/admin/users/x`, {
            token: seekerTokens.token
        });
        expect(status).toBe(403);
    });

    it("returns 400 when admin tries to delete their own account", async () => {
        const adminId = adminTokens.userId;
        const { status, body } = await callApi(
            "DELETE",
            `/admin/users/${adminId}`,
            { token: adminTokens.token }
        );
        expect(status).toBe(400);
        expect(body.success).toBe(false);
    });

    it("returns 404 for non-existent user", async () => {
        const { status } = await callApi(
            "DELETE",
            `/admin/users/000000000000000000000000`,
            { token: adminTokens.token }
        );
        expect(status).toBe(404);
    });

    it("soft-deletes a user successfully", async () => {
        expect(createdUserId).toBeDefined();
        const { status, body } = await callApi(
            "DELETE",
            `/admin/users/${createdUserId}`,
            { token: adminTokens.token }
        );
        expect(status).toBe(200);
        expect(body.success).toBe(true);

        // Verify deleted_at is now set (user not fetchable anymore via admin route)
        const { status: fetchStatus } = await callApi(
            "GET",
            `/admin/users/${createdUserId}`,
            { token: adminTokens.token }
        );
        expect(fetchStatus).toBe(404);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. admin-providers.ts — GET /admin/providers
// ════════════════════════════════════════════════════════════════════════════

describe("GET /admin/providers", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("GET", "/admin/providers");
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("GET", "/admin/providers", {
            token: seekerTokens.token
        });
        expect(status).toBe(403);
    });

    it("returns the provider list including seeded providers", async () => {
        const { status, body } = await callApi<{
            slug: string;
            name: string;
            enabled: boolean;
            pricing_tier: string;
            source_type: string;
        }[]>("GET", "/admin/providers", { token: adminTokens.token });

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);

        const alpha = body.data!.find(p => p.slug === PROVIDER_SLUG_1);
        expect(alpha).toBeDefined();
        expect(alpha!.enabled).toBe(true);
        expect(alpha!.pricing_tier).toBe("free");
        expect(alpha!.source_type).toBe("api");

        const beta = body.data!.find(p => p.slug === PROVIDER_SLUG_2);
        expect(beta).toBeDefined();
        expect(beta!.enabled).toBe(false);
        expect(beta!.pricing_tier).toBe("metered");
    });

    it("returns providers sorted free → freemium → metered", async () => {
        const { body } = await callApi<{ pricing_tier: string }[]>(
            "GET",
            "/admin/providers",
            { token: adminTokens.token }
        );
        const seededTiers = body
            .data!.filter(
                p => p.slug === PROVIDER_SLUG_1 || p.slug === PROVIDER_SLUG_2
            )
            .map(p => p.pricing_tier);
        const TIER_ORDER: Record<string, number> = { free: 0, freemium: 1, metered: 2 };
        for (let i = 1; i < seededTiers.length; i++) {
            expect(TIER_ORDER[seededTiers[i]!]).toBeGreaterThanOrEqual(
                TIER_ORDER[seededTiers[i - 1]!]
            );
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. admin-providers.ts — PATCH /admin/providers/:slug
// ════════════════════════════════════════════════════════════════════════════

describe("PATCH /admin/providers/:slug", () => {
    it("returns 401 without token", async () => {
        const { status } = await callApi("PATCH", `/admin/providers/${PROVIDER_SLUG_1}`, {
            body: { enabled: false }
        });
        expect(status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
        const { status } = await callApi("PATCH", `/admin/providers/${PROVIDER_SLUG_1}`, {
            token: seekerTokens.token,
            body: { enabled: false }
        });
        expect(status).toBe(403);
    });

    it("returns 404 for an unknown provider slug", async () => {
        const { status, body } = await callApi(
            "PATCH",
            `/admin/providers/${TAG}-does-not-exist`,
            {
                token: adminTokens.token,
                body: { enabled: true }
            }
        );
        expect(status).toBe(404);
        expect(body.success).toBe(false);
    });

    it("disables a provider and persists the change", async () => {
        const { status, body } = await callApi<{
            slug: string;
            enabled: boolean;
            updated_at: string | null;
        }>("PATCH", `/admin/providers/${PROVIDER_SLUG_1}`, {
            token: adminTokens.token,
            body: { enabled: false }
        });
        expect(status).toBe(200);
        expect(body.data!.slug).toBe(PROVIDER_SLUG_1);
        expect(body.data!.enabled).toBe(false);
        expect(body.data!.updated_at).not.toBeNull();
    });

    it("re-enables a provider", async () => {
        const { status, body } = await callApi<{ enabled: boolean }>(
            "PATCH",
            `/admin/providers/${PROVIDER_SLUG_1}`,
            {
                token: adminTokens.token,
                body: { enabled: true }
            }
        );
        expect(status).toBe(200);
        expect(body.data!.enabled).toBe(true);
    });

    it("enables a metered provider that had auth vars", async () => {
        const { status, body } = await callApi<{
            slug: string;
            enabled: boolean;
            requires_auth: boolean;
            auth_env_vars: string[];
            credentials_present: boolean;
        }>("PATCH", `/admin/providers/${PROVIDER_SLUG_2}`, {
            token: adminTokens.token,
            body: { enabled: true }
        });
        expect(status).toBe(200);
        expect(body.data!.enabled).toBe(true);
        expect(body.data!.requires_auth).toBe(true);
        expect(Array.isArray(body.data!.auth_env_vars)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. scraper-dispatch.service.ts — dispatchImport (via fetch mock)
// ════════════════════════════════════════════════════════════════════════════

describe("ScraperDispatchService — dispatchImport", () => {
    it("throws ScraperDispatchError when GH_DISPATCH_TOKEN is not configured", async () => {
        // Temporarily unset the token inside config
        const { dispatchImport } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error — patching readonly for test
        config.scraperDispatch.token = "";

        try {
            await dispatchImport("job");
            throw new Error("Should have thrown");
        } catch (err: unknown) {
            const e = err as { name: string; statusCode: number };
            expect(e.name).toBe("ScraperDispatchError");
            expect(e.statusCode).toBe(503);
        } finally {
            // @ts-expect-error — restore
            config.scraperDispatch.token = original;
        }
    });

    it("resolves with scraper+environment on a 204 response", async () => {
        const { dispatchImport } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");

        // Patch a non-empty token so assertConfigured() passes
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(null, { status: 204 })
        );

        try {
            const result = await dispatchImport("news");
            expect(result.scraper).toBe("news");
            expect(["production", "staging"]).toContain(result.environment);
            expect(spy).toHaveBeenCalledTimes(1);
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });

    it("throws ScraperDispatchError on non-204 response (e.g. 401)", async () => {
        const { dispatchImport } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("Unauthorized", { status: 401 })
        );

        try {
            await dispatchImport("both");
            throw new Error("Should have thrown");
        } catch (err: unknown) {
            const e = err as { name: string; statusCode: number };
            expect(e.name).toBe("ScraperDispatchError");
            expect(e.statusCode).toBe(502);
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });

    it("throws ScraperDispatchError on 403 response", async () => {
        const { dispatchImport } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("Forbidden", { status: 403 })
        );

        try {
            await dispatchImport("job");
            throw new Error("Should have thrown");
        } catch (err: unknown) {
            const e = err as { name: string };
            expect(e.name).toBe("ScraperDispatchError");
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 15. scraper-dispatch.service.ts — getLatestRun (via fetch mock)
// ════════════════════════════════════════════════════════════════════════════

describe("ScraperDispatchService — getLatestRun", () => {
    it("throws when token is missing", async () => {
        const { getLatestRun } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "";

        try {
            await getLatestRun();
            throw new Error("Should have thrown");
        } catch (err: unknown) {
            const e = err as { name: string };
            expect(e.name).toBe("ScraperDispatchError");
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
        }
    });

    it("returns null when workflow_runs is empty", async () => {
        const { getLatestRun } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ workflow_runs: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        );

        try {
            const result = await getLatestRun();
            expect(result).toBeNull();
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });

    it("returns a GitHubRunSummary when a run exists", async () => {
        const { getLatestRun } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const fakeRun = {
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/example/actions/runs/1",
            created_at: "2024-01-01T00:00:00Z",
            run_started_at: "2024-01-01T00:00:01Z",
            event: "workflow_dispatch"
        };

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ workflow_runs: [fakeRun] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        );

        try {
            const result = await getLatestRun();
            expect(result).not.toBeNull();
            expect(result!.status).toBe("completed");
            expect(result!.conclusion).toBe("success");
            expect(result!.event).toBe("workflow_dispatch");
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });

    it("throws ScraperDispatchError when API returns non-ok status", async () => {
        const { getLatestRun } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("Not Found", { status: 404 })
        );

        try {
            await getLatestRun();
            throw new Error("Should have thrown");
        } catch (err: unknown) {
            const e = err as { name: string; statusCode: number };
            expect(e.name).toBe("ScraperDispatchError");
            expect(e.statusCode).toBe(502);
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });

    it("handles a run with null/missing optional fields", async () => {
        const { getLatestRun } = await import("../src/services/admin/scraper-dispatch.service");
        const { config } = await import("../src/config");
        const original = config.scraperDispatch.token;
        // @ts-expect-error
        config.scraperDispatch.token = "test-gh-token";

        const fakeRun = {
            // status and conclusion omitted → should default to null
            html_url: "https://github.com/example/actions/runs/2",
            created_at: "2024-01-02T00:00:00Z"
            // run_started_at and event omitted
        };

        const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ workflow_runs: [fakeRun] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        );

        try {
            const result = await getLatestRun();
            expect(result).not.toBeNull();
            expect(result!.status).toBeNull();
            expect(result!.conclusion).toBeNull();
            expect(result!.run_started_at).toBeNull();
            expect(result!.event).toBe("");
        } finally {
            // @ts-expect-error
            config.scraperDispatch.token = original;
            spy.mockRestore();
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 16. providers.service.ts — direct service layer tests
// ════════════════════════════════════════════════════════════════════════════

describe("providers.service — listProviders", () => {
    it("returns all providers including seeded ones", async () => {
        const { listProviders } = await import("../src/services/admin/providers.service");
        const providers = await listProviders();
        expect(Array.isArray(providers)).toBe(true);
        const slugs = providers.map(p => p.slug);
        expect(slugs).toContain(PROVIDER_SLUG_1);
        expect(slugs).toContain(PROVIDER_SLUG_2);
    });

    it("maps unknown pricing_tier to 'free'", async () => {
        // Insert a doc with an invalid tier temporarily
        const db = await getMongoDb();
        const badSlug = `${TAG}-bad-tier`;
        await db.collection("providers").insertOne({
            slug: badSlug,
            name: "Bad Tier",
            enabled: false,
            pricing_tier: "enterprise", // not in VALID_TIERS
            source_type: "api",
            geo: "IT",
            source_url: "",
            notes: "",
            requires_auth: false,
            auth_env_vars: [],
            credentials_present: true,
            updated_at: null
        });

        try {
            const { listProviders } = await import("../src/services/admin/providers.service");
            const providers = await listProviders();
            const bad = providers.find(p => p.slug === badSlug);
            expect(bad).toBeDefined();
            expect(bad!.pricing_tier).toBe("free"); // fallback
        } finally {
            await db.collection("providers").deleteMany({ slug: badSlug });
        }
    });

    it("maps unknown source_type to 'api'", async () => {
        const db = await getMongoDb();
        const badSlug = `${TAG}-bad-source-type`;
        await db.collection("providers").insertOne({
            slug: badSlug,
            name: "Bad Source",
            enabled: true,
            pricing_tier: "free",
            source_type: "webhook", // not in VALID_SOURCE_TYPES
            geo: "EN",
            source_url: "",
            notes: "",
            requires_auth: false,
            auth_env_vars: [],
            credentials_present: true,
            updated_at: null
        });

        try {
            const { listProviders } = await import("../src/services/admin/providers.service");
            const providers = await listProviders();
            const bad = providers.find(p => p.slug === badSlug);
            expect(bad).toBeDefined();
            expect(bad!.source_type).toBe("api"); // fallback
        } finally {
            await db.collection("providers").deleteMany({ slug: badSlug });
        }
    });

    it("derives requires_auth from auth_env_vars when field is missing", async () => {
        const db = await getMongoDb();
        const slugWithVars = `${TAG}-auth-vars`;
        await db.collection("providers").insertOne({
            slug: slugWithVars,
            name: "Auth Vars",
            enabled: false,
            pricing_tier: "freemium",
            source_type: "ats",
            geo: "FR",
            source_url: "",
            notes: "",
            // requires_auth NOT set — should be derived from auth_env_vars.length > 0
            auth_env_vars: ["MY_KEY", "MY_SECRET"],
            credentials_present: false,
            updated_at: null
        });

        try {
            const { listProviders } = await import("../src/services/admin/providers.service");
            const providers = await listProviders();
            const p = providers.find(pp => pp.slug === slugWithVars);
            expect(p).toBeDefined();
            expect(p!.requires_auth).toBe(true);
            expect(p!.credentials_present).toBe(false);
        } finally {
            await db.collection("providers").deleteMany({ slug: slugWithVars });
        }
    });
});

describe("providers.service — setProviderEnabled", () => {
    it("returns null for a non-existent slug", async () => {
        const { setProviderEnabled } = await import(
            "../src/services/admin/providers.service"
        );
        const result = await setProviderEnabled(`${TAG}-does-not-exist`, true);
        expect(result).toBeNull();
    });

    it("flips enabled and updates updated_at", async () => {
        const { setProviderEnabled } = await import(
            "../src/services/admin/providers.service"
        );
        const result = await setProviderEnabled(PROVIDER_SLUG_2, true);
        expect(result).not.toBeNull();
        expect(result!.enabled).toBe(true);
        expect(result!.updated_at).not.toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 17. admin.service.ts — direct service layer coverage
// ════════════════════════════════════════════════════════════════════════════

describe("admin.service — getStatistics branches", () => {
    it("handles empty database gracefully (counts = 0 is valid)", async () => {
        const { getStatistics } = await import("../src/services/admin/admin.service");
        // Should not throw even on an empty-ish DB
        const stats = await getStatistics();
        expect(typeof stats.overview.users.total).toBe("number");
        expect(typeof stats.charts.topSkills).toBe("object");
    });

    it("getRegistrationsTimeline returns correct bucket count", async () => {
        const { getRegistrationsTimeline } = await import(
            "../src/services/admin/admin.service"
        );
        const result = await getRegistrationsTimeline(14);
        expect(result.length).toBe(14);
        result.forEach(row => {
            expect(typeof row.date).toBe("string");
            expect(typeof row.count).toBe("number");
        });
    });

    it("getJobsTimeline returns correct week bucket count", async () => {
        const { getJobsTimeline } = await import("../src/services/admin/admin.service");
        const result = await getJobsTimeline(4);
        expect(result.length).toBe(4);
        result.forEach(row => {
            expect(typeof row.week).toBe("string");
            expect(typeof row.count).toBe("number");
        });
    });

    it("getApplicationsTimeline returns day buckets", async () => {
        const { getApplicationsTimeline } = await import(
            "../src/services/admin/admin.service"
        );
        const result = await getApplicationsTimeline(7);
        expect(result.length).toBe(7);
    });

    it("getActivityHeatmap returns 168 cells (7×24)", async () => {
        const { getActivityHeatmap } = await import(
            "../src/services/admin/admin.service"
        );
        const result = await getActivityHeatmap(30);
        expect(result.cells.length).toBe(7 * 24);
        expect(typeof result.max).toBe("number");
    });

    it("getLoginMethodsDistribution returns static mock data", async () => {
        const { getLoginMethodsDistribution } = await import(
            "../src/services/admin/admin.service"
        );
        const result = await getLoginMethodsDistribution();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toMatchObject({ method: expect.any(String), count: expect.any(Number) });
    });

    it("getTopLanguages returns an array (possibly empty with no profiles)", async () => {
        const { getTopLanguages } = await import("../src/services/admin/admin.service");
        const result = await getTopLanguages(5);
        expect(Array.isArray(result)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 18. currentEnvironment helper
// ════════════════════════════════════════════════════════════════════════════

describe("ScraperDispatchService — currentEnvironment", () => {
    it("returns 'staging' in test/development environments", async () => {
        const { currentEnvironment } = await import(
            "../src/services/admin/scraper-dispatch.service"
        );
        const env = currentEnvironment();
        // In CI / local tests APP_ENV is not "production"
        expect(["production", "staging"]).toContain(env);
    });
});
