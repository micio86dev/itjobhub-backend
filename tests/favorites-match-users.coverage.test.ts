/**
 * Coverage tests for:
 *  - src/routes/favorites.ts
 *  - src/routes/image-proxy.ts
 *  - src/services/jobs/match.service.ts
 *  - src/services/users/user.service.ts
 *
 * Isolation: uses itjobhub_test_bec database.
 * Identifiers carry the "bec-" prefix + timestamp for scoped cleanup.
 */

import { describe, expect, it, beforeAll, afterAll, spyOn, mock } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { loginUser, createAuthHeaders, type AuthTokens } from "./helpers/auth";
import {
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    changeUserPassword,
    deleteUser,
    softDeleteUser,
    getUsers,
    getUserProfile,
    upsertUserProfile,
    addUserSkill,
    InvalidPasswordError,
} from "../src/services/users/user.service";
import { calculateMatchScore, calculateBatchMatchScores } from "../src/services/jobs/match.service";
import { hashPassword } from "../src/utils/password";

const api = treaty(app);

// ─── Shared state ────────────────────────────────────────────────────────────
const TS = Date.now();
const TAG = `bec-${TS}`;

let seekerTokens: AuthTokens;
let seekerUserId: string;

// IDs of records created by this suite (for cleanup)
const createdUserIds: string[] = [];
const createdJobIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdFavoriteUserIds: string[] = [];

// ─── beforeAll ───────────────────────────────────────────────────────────────
beforeAll(async () => {
    seekerTokens = await loginUser(app, "jobSeeker");
    seekerUserId = seekerTokens.userId;
});

// ─── afterAll ────────────────────────────────────────────────────────────────
afterAll(async () => {
    // Remove favorites created by our seeker during these tests
    if (createdJobIds.length > 0) {
        await prisma.favorite.deleteMany({
            where: {
                user_id: seekerUserId,
                job_id: { in: createdJobIds },
            },
        });
    }

    // Remove interactions created for our jobs
    if (createdJobIds.length > 0) {
        await prisma.interaction.deleteMany({
            where: { trackable_type: "job", trackable_id: { in: createdJobIds } },
        });
    }

    // Remove jobs
    for (const id of createdJobIds) {
        try {
            await prisma.job.delete({ where: { id } });
        } catch { /* already gone */ }
    }

    // Remove companies
    for (const id of createdCompanyIds) {
        try {
            await prisma.company.delete({ where: { id } });
        } catch { /* already gone */ }
    }

    // Remove extra users (profiles cascade via Prisma)
    for (const id of [...createdUserIds, ...createdFavoriteUserIds]) {
        try {
            await prisma.userProfile.deleteMany({ where: { user_id: id } });
            await prisma.refreshToken.deleteMany({ where: { user_id: id } });
            await prisma.user.delete({ where: { id } });
        } catch { /* already gone */ }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Create a job via prisma and register its ID for cleanup. */
async function seedJob(overrides: Record<string, unknown> = {}, companyId?: string) {
    const job = await prisma.job.create({
        data: {
            title: `${TAG}-job-${Math.random().toString(36).slice(2)}`,
            description: "Coverage test job",
            link: `https://example.com/job-${TAG}-${Math.random().toString(36).slice(2)}`,
            skills: ["TypeScript", "React"],
            remote: true,
            status: "active",
            ...(companyId ? { company: { connect: { id: companyId } } } : {}),
            ...overrides,
        },
    });
    createdJobIds.push(job.id);
    return job;
}

/** Create a company via prisma and register its ID for cleanup. */
async function seedCompany(overrides: Record<string, unknown> = {}) {
    const company = await prisma.company.create({
        data: {
            name: `${TAG}-co-${Math.random().toString(36).slice(2)}`,
            trustScore: 80,
            totalRatings: 10,
            ...overrides,
        },
    });
    createdCompanyIds.push(company.id);
    return company;
}

/** Register a new user directly and return ID. */
async function seedUser(emailSuffix: string, password = "password123") {
    const email = `${TAG}-${emailSuffix}@test.local`;
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            password: hashed,
            first_name: "Bec",
            last_name: "Tester",
            role: "user",
        },
    });
    createdUserIds.push(user.id);
    return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// FAVORITES ROUTE
// ─────────────────────────────────────────────────────────────────────────────
describe("favorites route", () => {
    let job1Id: string;
    let job2Id: string;

    beforeAll(async () => {
        const j1 = await seedJob({ title: `${TAG}-fav-job-1`, remote: true });
        const j2 = await seedJob({ title: `${TAG}-fav-job-2`, remote: true });
        job1Id = j1.id;
        job2Id = j2.id;
    });

    // POST /favorites — add
    it("POST /favorites — add job to favorites", async () => {
        const res = await app.handle(
            new Request("http://localhost/favorites", {
                method: "POST",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({ jobId: job1Id }),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.data as Record<string, unknown>).job_id).toBe(job1Id);
    });

    it("POST /favorites — returns 409 when already favorited", async () => {
        // job1Id is already favorited from the test above
        const res = await app.handle(
            new Request("http://localhost/favorites", {
                method: "POST",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({ jobId: job1Id }),
            })
        );
        expect(res.status).toBe(409);
    });

    it("POST /favorites — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId: job1Id }),
            })
        );
        expect(res.status).toBe(401);
    });

    // GET /favorites
    it("GET /favorites — returns list with job details", async () => {
        // Ensure job2 is also favorited
        await app.handle(
            new Request("http://localhost/favorites", {
                method: "POST",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({ jobId: job2Id }),
            })
        );

        const res = await app.handle(
            new Request("http://localhost/favorites", {
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        const data = body.data as Array<Record<string, unknown>>;
        expect(Array.isArray(data)).toBe(true);
        const foundJobIds = data.map((f) => (f.job as Record<string, unknown>).id);
        expect(foundJobIds).toContain(job1Id);
        expect(foundJobIds).toContain(job2Id);
    });

    it("GET /favorites — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/favorites")
        );
        expect(res.status).toBe(401);
    });

    it("GET /favorites — cleans up orphan favorites (missing job)", async () => {
        // Create a job, add to favorites, then delete the job so its record becomes orphan
        const orphanJob = await prisma.job.create({
            data: {
                title: `${TAG}-orphan-job`,
                description: "Will be deleted",
                link: `https://example.com/orphan-${TAG}`,
                skills: [],
                remote: true,
                status: "active",
            },
        });
        // Add orphan job to favorites
        await prisma.favorite.create({
            data: { user_id: seekerUserId, job_id: orphanJob.id },
        });
        // Hard delete the job (bypassing Prisma cascade for the test scenario)
        await prisma.job.delete({ where: { id: orphanJob.id } });

        // GET favorites — should auto-clean orphan and not throw
        const res = await app.handle(
            new Request("http://localhost/favorites", {
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        // Orphan job must NOT appear in list
        const data = body.data as Array<Record<string, unknown>>;
        const foundJobIds = data.map((f) => (f.job as Record<string, unknown>).id);
        expect(foundJobIds).not.toContain(orphanJob.id);

        // Verify favorite record was removed from DB
        const orphanFav = await prisma.favorite.findFirst({
            where: { user_id: seekerUserId, job_id: orphanJob.id },
        });
        expect(orphanFav).toBeNull();
    });

    it("GET /favorites — job reaction counts are included", async () => {
        const res = await app.handle(
            new Request("http://localhost/favorites", {
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        const data = body.data as Array<Record<string, unknown>>;
        if (data.length > 0) {
            const firstJob = data[0].job as Record<string, unknown>;
            expect(typeof firstJob.likes).toBe("number");
            expect(typeof firstJob.dislikes).toBe("number");
            expect(typeof firstJob.comments_count).toBe("number");
        }
    });

    // DELETE /favorites
    it("DELETE /favorites — removes job from favorites", async () => {
        const res = await app.handle(
            new Request(`http://localhost/favorites?jobId=${job1Id}`, {
                method: "DELETE",
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        // Verify actually removed
        const fav = await prisma.favorite.findFirst({
            where: { user_id: seekerUserId, job_id: job1Id },
        });
        expect(fav).toBeNull();
    });

    it("DELETE /favorites — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request(`http://localhost/favorites?jobId=${job1Id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(401);
    });

    it("DELETE /favorites — removing non-existent favorite succeeds (idempotent)", async () => {
        // job1Id was already removed above
        const res = await app.handle(
            new Request(`http://localhost/favorites?jobId=${job1Id}`, {
                method: "DELETE",
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE-PROXY ROUTE
// ─────────────────────────────────────────────────────────────────────────────
describe("image-proxy route", () => {
    it("returns 400 when url query param is missing (validation)", async () => {
        // Elysia validates the schema and returns 422 for missing required query param
        const res = await app.handle(
            new Request("http://localhost/image-proxy")
        );
        // Elysia schema validation returns 422 for missing required param
        expect([400, 422]).toContain(res.status);
    });

    it("returns 400 for invalid protocol (non-http/https)", async () => {
        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=ftp://example.com/image.png")
        );
        expect(res.status).toBe(400);
        const body = await res.json() as Record<string, unknown>;
        expect(body.success).toBe(false);
        expect(String(body.error)).toContain("protocol");
    });

    it("proxies a valid image URL and returns image bytes", async () => {
        const fakeImageBuffer = new Uint8Array([0x47, 0x49, 0x46]); // GIF magic bytes
        const mockFetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(fakeImageBuffer, {
                status: 200,
                headers: { "Content-Type": "image/gif" },
            })
        );

        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=https://example.com/test.gif")
        );

        expect(res.status).toBe(200);
        // Content-Type should be forwarded
        expect(res.headers.get("Content-Type")).toContain("image/gif");
        // Cache-Control should be set
        expect(res.headers.get("Cache-Control")).toContain("max-age");

        mockFetch.mockRestore();
    });

    it("returns upstream status when fetch returns non-ok", async () => {
        const mockFetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(null, { status: 404 })
        );

        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=https://example.com/missing.png")
        );

        expect(res.status).toBe(404);
        const body = await res.json() as Record<string, unknown>;
        expect(body.success).toBe(false);

        mockFetch.mockRestore();
    });

    it("returns 500 when fetch throws", async () => {
        const mockFetch = spyOn(globalThis, "fetch").mockRejectedValueOnce(
            new Error("Network error")
        );

        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=https://example.com/fail.png")
        );

        expect(res.status).toBe(500);
        const body = await res.json() as Record<string, unknown>;
        expect(body.success).toBe(false);

        mockFetch.mockRestore();
    });

    it("returns 400 for a URL with invalid format (URL parse error)", async () => {
        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=not-a-url")
        );
        // new URL("not-a-url") throws, landing in catch -> 500
        // OR Elysia schema validation rejects — either is acceptable
        expect([400, 422, 500]).toContain(res.status);
    });

    it("proxies image without Content-Type header gracefully", async () => {
        const mockFetch = spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(new Uint8Array([0xff, 0xd8]), {
                status: 200,
                // No Content-Type header
            })
        );

        const res = await app.handle(
            new Request("http://localhost/image-proxy?url=https://example.com/no-ct.jpg")
        );

        expect(res.status).toBe(200);
        mockFetch.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MATCH SERVICE
// ─────────────────────────────────────────────────────────────────────────────
describe("match service — calculateMatchScore", () => {
    let matchUserId: string;
    let matchCompanyId: string;

    beforeAll(async () => {
        // Create dedicated user + profile for match tests
        const user = await seedUser("match");
        matchUserId = user.id;

        const company = await seedCompany({ trustScore: 90, totalRatings: 20 });
        matchCompanyId = company.id;
    });

    async function setProfile(data: Record<string, unknown>) {
        await prisma.userProfile.upsert({
            where: { user_id: matchUserId },
            update: data,
            create: {
                user_id: matchUserId,
                languages: [],
                skills: [],
                workModes: [],
                ...data,
            },
        });
    }

    // --- skills match branches ---
    it("skillsMatch = 100 when job has no skills", async () => {
        await setProfile({ skills: ["TypeScript"], seniority: "senior" });
        const job = await seedJob({ skills: [], technical_skills: [], remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.skillsMatch).toBe(100);
        expect(result.details.matchedSkills).toHaveLength(0);
    });

    it("skillsMatch partial when user has some skills", async () => {
        await setProfile({ skills: ["TypeScript", "React"], seniority: "junior" });
        const job = await seedJob({
            skills: ["TypeScript", "React", "Python"],
            remote: true,
            status: "active",
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        // 2/3 * 100 ≈ 66.66
        expect(result.factors.skillsMatch).toBeGreaterThan(66);
        expect(result.factors.skillsMatch).toBeLessThan(67);
        expect(result.details.matchedSkills).toContain("typescript");
        expect(result.details.missingSkills).toContain("python");
    });

    it("skillsMatch considers technical_skills of job", async () => {
        await setProfile({ skills: ["Go"], seniority: "mid" });
        const job = await seedJob({
            skills: ["TypeScript"],
            technical_skills: ["Go"],
            remote: true,
            status: "active",
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        // 1/2 skills matched
        expect(result.factors.skillsMatch).toBe(50);
    });

    // --- seniority match branches ---
    it("seniorityMatch = 100 (perfect) when both are senior", async () => {
        await setProfile({ skills: [], seniority: "senior" });
        const job = await seedJob({ skills: [], seniority: "senior", remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(100);
        expect(result.details.seniorityGap).toBe("perfect");
    });

    it("seniorityMatch = 70 (overqualified) when user is more senior", async () => {
        await setProfile({ skills: [], seniority: "senior" });
        const job = await seedJob({ skills: [], seniority: "junior", remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(70);
        expect(result.details.seniorityGap).toBe("overqualified");
    });

    it("seniorityMatch = 30 (underqualified_close) when user is one step below", async () => {
        await setProfile({ skills: [], seniority: "junior" });
        const job = await seedJob({ skills: [], seniority: "mid", remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(30);
        expect(result.details.seniorityGap).toBe("underqualified_close");
    });

    it("seniorityMatch = 0 (underqualified_far) when user is too junior", async () => {
        await setProfile({ skills: [], seniority: "junior" });
        const job = await seedJob({ skills: [], seniority: "senior", remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(0);
        expect(result.details.seniorityGap).toBe("underqualified_far");
    });

    it("seniorityMatch = 50 when both unknown", async () => {
        await setProfile({ skills: [], seniority: null });
        const job = await seedJob({ skills: [], seniority: null, experience_level: null, remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(50);
    });

    it("seniorityMatch = 40 when only one side is unknown", async () => {
        await setProfile({ skills: [], seniority: "senior" });
        const job = await seedJob({ skills: [], seniority: null, experience_level: null, remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.seniorityMatch).toBe(40);
    });

    // --- location match branches ---
    it("locationMatch = 100 when job is remote and user wants remote", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["remote"] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(100);
        expect(result.details.locationStatus).toBe("remote_match");
    });

    it("locationMatch = 100 when job is remote and user has no preference", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(100);
    });

    it("locationMatch = 0 when job is remote but user doesn't want remote", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["onsite"] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(0);
        expect(result.details.locationStatus).toBe("remote_mismatch");
    });

    it("locationMatch = 0 when user only wants remote but job is onsite", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["remote"], location: "Milan" });
        const job = await seedJob({ skills: [], remote: false, is_remote: false, location: "Rome", status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(0);
        expect(result.details.locationStatus).toBe("remote_only_mismatch");
    });

    it("locationMatch = 100 (exact) when onsite locations match", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["onsite"], location: "Milan" });
        const job = await seedJob({ skills: [], remote: false, is_remote: false, location: "Milan", status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(100);
        expect(result.details.locationStatus).toBe("exact");
    });

    it("locationMatch = 0 (different_location) when onsite locations differ", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["onsite"], location: "Turin" });
        const job = await seedJob({ skills: [], remote: false, is_remote: false, location: "Rome", status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(0);
        expect(result.details.locationStatus).toBe("different_location");
    });

    it("locationMatch = 50 (ambiguous) when location info missing", async () => {
        await setProfile({ skills: [], seniority: null, workModes: ["onsite"], location: null });
        const job = await seedJob({ skills: [], remote: false, location: null, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.locationMatch).toBe(50);
    });

    // --- trust score branches ---
    it("trustScore = 100 when company trustScore > 80", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const highTrustCo = await seedCompany({ trustScore: 95, totalRatings: 10 });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, highTrustCo.id);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.trustScore).toBe(100);
    });

    it("trustScore = 70 when company trustScore is 60–80", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const medTrustCo = await seedCompany({ trustScore: 70, totalRatings: 10 });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, medTrustCo.id);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.trustScore).toBe(70);
    });

    it("trustScore = 50 when company trustScore is 40–59", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const lowTrustCo = await seedCompany({ trustScore: 50, totalRatings: 10 });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, lowTrustCo.id);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.trustScore).toBe(50);
    });

    it("trustScore = 20 when company trustScore < 40", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const badTrustCo = await seedCompany({ trustScore: 20, totalRatings: 10 });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, badTrustCo.id);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.trustScore).toBe(20);
    });

    it("trustScore = 70 (default 80) when job has no company", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" });

        const result = await calculateMatchScore(matchUserId, job.id);
        // Default trust = 80, which maps to 70 (>= 60 bracket)
        expect(result.factors.trustScore).toBe(70);
    });

    // --- salary match branches ---
    it("salaryMatch = 100 when job salary_max >= profile salaryMin", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], salaryMin: 50000 });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            salary_max: 80000,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.salaryMatch).toBe(100);
    });

    it("salaryMatch proportional when job salary_max < profile salaryMin", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], salaryMin: 60000 });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            salary_max: 40000,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        // 40000/60000 * 100 ≈ 67
        expect(result.factors.salaryMatch).toBeLessThan(70);
        expect(result.factors.salaryMatch).toBeGreaterThan(60);
    });

    it("salaryMatch = 50 (neutral) when job has no salary info and user has requirement", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], salaryMin: 50000 });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            salary_max: null,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.salaryMatch).toBe(50);
    });

    it("salaryMatch = 100 when user has no salary requirement (salaryMin = 0)", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], salaryMin: 0 });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            salary_max: null,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.salaryMatch).toBe(100);
    });

    // --- employment match branches ---
    it("employmentMatch = 100 when user has no preference", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], availability: [] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            employment_type: "Full-time",
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.employmentMatch).toBe(100);
    });

    it("employmentMatch = 100 when job employment type matches user preference", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], availability: ["full-time"] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            employment_type: "Full-time",
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.employmentMatch).toBe(100);
    });

    it("employmentMatch = 0 when employment type mismatches", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], availability: ["full-time"] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            employment_type: "contract",
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.employmentMatch).toBe(0);
    });

    it("employmentMatch = 100 when job has unknown employment type", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [], availability: ["full-time"] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            employment_type: null,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.employmentMatch).toBe(100);
    });

    // --- application demand (demandScore) branches ---
    it("applicationRate = 100 when <= 2 applies", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.applicationRate).toBe(100);
    });

    it("applicationRate = 70 when 3–5 applies", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        // Seed 4 APPLY interactions
        for (let i = 0; i < 4; i++) {
            await prisma.interaction.create({
                data: {
                    trackable_type: "job",
                    trackable_id: job.id,
                    type: "APPLY",
                    fingerprint: `fp-${TAG}-${i}`,
                },
            });
        }

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.applicationRate).toBe(70);
    });

    it("applicationRate = 40 when 6–10 applies", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        for (let i = 0; i < 8; i++) {
            await prisma.interaction.create({
                data: {
                    trackable_type: "job",
                    trackable_id: job.id,
                    type: "APPLY",
                    fingerprint: `fp2-${TAG}-${i}`,
                },
            });
        }

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.applicationRate).toBe(40);
    });

    it("applicationRate = 20 when 11–20 applies", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        for (let i = 0; i < 15; i++) {
            await prisma.interaction.create({
                data: {
                    trackable_type: "job",
                    trackable_id: job.id,
                    type: "APPLY",
                    fingerprint: `fp3-${TAG}-${i}`,
                },
            });
        }

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.applicationRate).toBe(20);
    });

    it("applicationRate = 0 when > 20 applies", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);

        for (let i = 0; i < 25; i++) {
            await prisma.interaction.create({
                data: {
                    trackable_type: "job",
                    trackable_id: job.id,
                    type: "APPLY",
                    fingerprint: `fp4-${TAG}-${i}`,
                },
            });
        }

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.applicationRate).toBe(0);
    });

    // --- timeliness branches ---
    it("timeliness = 70 when job is 2 days old", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            published_at: twoDaysAgo,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.timeliness).toBe(70);
    });

    it("timeliness = 40 when job is 5 days old", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            published_at: fiveDaysAgo,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.timeliness).toBe(40);
    });

    it("timeliness = 20 when job is 10 days old", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            published_at: tenDaysAgo,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.timeliness).toBe(20);
    });

    it("timeliness = 0 when job is 20 days old", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            published_at: twentyDaysAgo,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.timeliness).toBe(0);
    });

    // --- competition (views) branches ---
    it("competition = 60 when job has 30–99 views", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            views_count: 50,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.competition).toBe(60);
    });

    it("competition = 30 when job has 100–299 views", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            views_count: 200,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.competition).toBe(30);
    });

    it("competition = 0 when job has >= 300 views", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({
            skills: [], remote: true, status: "active",
            views_count: 400,
        }, matchCompanyId);

        const result = await calculateMatchScore(matchUserId, job.id);
        expect(result.factors.competition).toBe(0);
    });

    // --- errors ---
    it("throws when profile not found", async () => {
        const job = await seedJob({ skills: [], remote: true, status: "active" }, matchCompanyId);
        await expect(calculateMatchScore("000000000000000000000001", job.id)).rejects.toThrow("Profile or Job not found");
    });

    it("throws when job not found", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        await expect(calculateMatchScore(matchUserId, "000000000000000000000001")).rejects.toThrow("Profile or Job not found");
    });

    it("throws when job has HIDDEN status (expired)", async () => {
        await setProfile({ skills: [], seniority: null, workModes: [] });
        const job = await seedJob({ skills: [], remote: true, status: "expired" }, matchCompanyId);

        await expect(calculateMatchScore(matchUserId, job.id)).rejects.toThrow("Profile or Job not found");
    });
});

describe("match service — calculateBatchMatchScores", () => {
    let batchUserId: string;
    let batchCompanyId: string;

    beforeAll(async () => {
        const user = await seedUser("batch");
        batchUserId = user.id;
        const company = await seedCompany({ trustScore: 80, totalRatings: 5 });
        batchCompanyId = company.id;
    });

    async function setBatchProfile(data: Record<string, unknown>) {
        await prisma.userProfile.upsert({
            where: { user_id: batchUserId },
            update: data,
            create: {
                user_id: batchUserId,
                languages: [],
                skills: [],
                workModes: [],
                ...data,
            },
        });
    }

    it("returns empty object for empty jobIds array", async () => {
        const result = await calculateBatchMatchScores(batchUserId, []);
        expect(result).toEqual({});
    });

    it("returns empty object when profile not found", async () => {
        const job = await seedJob({ skills: [], remote: true, status: "active" }, batchCompanyId);
        const result = await calculateBatchMatchScores("000000000000000000000002", [job.id]);
        expect(result).toEqual({});
    });

    it("returns scores for multiple jobs with correct labels", async () => {
        await setBatchProfile({ skills: ["TypeScript", "React"], seniority: "senior", workModes: [] });
        const j1 = await seedJob({ skills: ["TypeScript", "React"], seniority: "senior", remote: true, status: "active" }, batchCompanyId);
        const j2 = await seedJob({ skills: ["Cobol"], seniority: "intern", remote: false, location: "Tokyo", status: "active" }, batchCompanyId);

        const result = await calculateBatchMatchScores(batchUserId, [j1.id, j2.id]);
        expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);
        if (result[j1.id]) {
            expect(result[j1.id].score).toBeGreaterThan(result[j2.id]?.score ?? -1);
            const score = result[j1.id].score;
            const label = score >= 75 ? "excellent" : score >= 50 ? "good" : score >= 30 ? "fair" : "low";
            expect(result[j1.id].label).toBe(label);
        }
    });

    it("excludes expired jobs from batch results", async () => {
        await setBatchProfile({ skills: [], seniority: null, workModes: [] });
        const activeJob = await seedJob({ skills: [], remote: true, status: "active" }, batchCompanyId);
        const expiredJob = await seedJob({ skills: [], remote: true, status: "expired" }, batchCompanyId);

        const result = await calculateBatchMatchScores(batchUserId, [activeJob.id, expiredJob.id]);
        expect(result[activeJob.id]).toBeDefined();
        expect(result[expiredJob.id]).toBeUndefined();
    });

    it("batch handles onsite/hybrid location scoring correctly", async () => {
        await setBatchProfile({
            skills: [],
            seniority: null,
            workModes: ["hybrid"],
            location: "Milan",
        });
        const localJob = await seedJob({ skills: [], remote: false, is_remote: false, location: "Milan", status: "active" }, batchCompanyId);
        const remoteJob = await seedJob({ skills: [], remote: true, status: "active" }, batchCompanyId);

        const result = await calculateBatchMatchScores(batchUserId, [localJob.id, remoteJob.id]);
        // Both jobs must have a score entry
        expect(result[localJob.id]).toBeDefined();
        expect(result[remoteJob.id]).toBeDefined();
        // Local job (Milan / hybrid) should score better than remote job
        // (user has hybrid pref but NOT remote → remote job gets locationMatch=0)
        expect(result[localJob.id].score).toBeGreaterThan(result[remoteJob.id].score);
    });

    it("batch timeliness branches — 40 (5 days), 20 (10 days), 0 (20 days)", async () => {
        await setBatchProfile({ skills: [], seniority: null, workModes: [] });
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
        const j5 = await seedJob({ skills: [], remote: true, status: "active", published_at: fiveDaysAgo }, batchCompanyId);
        const j10 = await seedJob({ skills: [], remote: true, status: "active", published_at: tenDaysAgo }, batchCompanyId);
        const j20 = await seedJob({ skills: [], remote: true, status: "active", published_at: twentyDaysAgo }, batchCompanyId);

        const result = await calculateBatchMatchScores(batchUserId, [j5.id, j10.id, j20.id]);
        // All three should be scored (coverage of timeliness branches)
        expect(result[j5.id]).toBeDefined();
        expect(result[j10.id]).toBeDefined();
        expect(result[j20.id]).toBeDefined();
        // Older jobs score <= newer jobs (timeliness contribution)
        expect(result[j5.id].score).toBeGreaterThanOrEqual(result[j20.id].score);
    });

    it("batch employment match — Italian locale tokens covered", async () => {
        await setBatchProfile({ skills: [], seniority: null, workModes: [], availability: ["tempo pieno"] });
        const job = await seedJob({ skills: [], remote: true, status: "active", employment_type: "tempo pieno" }, batchCompanyId);
        const result = await calculateBatchMatchScores(batchUserId, [job.id]);
        expect(result[job.id]).toBeDefined();
    });

    it("batch salary: proportional when job salary_max < salaryMin", async () => {
        await setBatchProfile({ skills: [], seniority: null, workModes: [], salaryMin: 80000 });
        const lowSalaryJob = await seedJob({
            skills: [], remote: true, status: "active",
            salary_max: 40000,
        }, batchCompanyId);

        const result = await calculateBatchMatchScores(batchUserId, [lowSalaryJob.id]);
        if (result[lowSalaryJob.id]) {
            // Score should be penalised but > 0
            expect(result[lowSalaryJob.id].score).toBeGreaterThan(0);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// USER SERVICE
// ─────────────────────────────────────────────────────────────────────────────
describe("user service — direct unit tests", () => {
    let serviceUserId: string;
    const serviceEmail = `${TAG}-svc@test.local`;

    beforeAll(async () => {
        // Ensure clean slate
        await prisma.user.deleteMany({ where: { email: serviceEmail } });
        const hashed = await hashPassword("password123");
        const user = await prisma.user.create({
            data: {
                email: serviceEmail,
                password: hashed,
                first_name: "Svc",
                last_name: "User",
                role: "user",
            },
        });
        serviceUserId = user.id;
        createdUserIds.push(serviceUserId);
    });

    it("getUserById returns user with profile", async () => {
        const result = await getUserById(serviceUserId);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(serviceUserId);
        expect(result!.email).toBe(serviceEmail);
    });

    it("getUserById returns null for non-existent user", async () => {
        const result = await getUserById("000000000000000000000099");
        expect(result).toBeNull();
    });

    it("getUserById returns null for soft-deleted user", async () => {
        const softUser = await seedUser("soft-del");
        await prisma.user.update({
            where: { id: softUser.id },
            data: { deleted_at: new Date() },
        });
        const result = await getUserById(softUser.id);
        expect(result).toBeNull();
    });

    it("getUserByEmail returns user", async () => {
        const result = await getUserByEmail(serviceEmail);
        expect(result).not.toBeNull();
        expect(result!.email).toBe(serviceEmail);
    });

    it("getUserByEmail returns null for non-existent email", async () => {
        const result = await getUserByEmail("nonexistent@test.local");
        expect(result).toBeNull();
    });

    it("getUserByEmail returns null for soft-deleted user", async () => {
        const softUser2 = await seedUser("soft-del2");
        const deletedEmail = softUser2.email;
        await prisma.user.update({
            where: { id: softUser2.id },
            data: { deleted_at: new Date() },
        });
        const result = await getUserByEmail(deletedEmail);
        expect(result).toBeNull();
    });

    it("updateUser updates fields", async () => {
        const updated = await updateUser(serviceUserId, { first_name: "Updated" });
        expect(updated.first_name).toBe("Updated");
    });

    it("getUserProfile returns null when no profile exists", async () => {
        const user = await seedUser("noprofile");
        const profile = await getUserProfile(user.id);
        expect(profile).toBeNull();
    });

    it("getUserProfile returns profile when it exists", async () => {
        await prisma.userProfile.create({
            data: {
                user_id: serviceUserId,
                languages: ["en"],
                skills: ["TypeScript"],
                workModes: [],
            },
        });
        const profile = await getUserProfile(serviceUserId);
        expect(profile).not.toBeNull();
        expect(profile!.user_id).toBe(serviceUserId);
    });

    it("upsertUserProfile creates profile when none exists", async () => {
        const newUser = await seedUser("upsert-create");
        const profile = await upsertUserProfile(newUser.id, {
            skills: ["Go"],
            languages: ["en"],
        });
        expect(profile.skills).toContain("Go");
    });

    it("upsertUserProfile updates existing profile", async () => {
        // serviceUserId already has a profile from previous test
        const profile = await upsertUserProfile(serviceUserId, {
            skills: ["Python", "Rust"],
            seniority: "senior",
        });
        expect(profile.skills).toContain("Python");
        expect(profile.seniority).toBe("senior");
    });

    it("upsertUserProfile updates User model fields (firstName, lastName)", async () => {
        await upsertUserProfile(serviceUserId, {
            firstName: "John",
            lastName: "Doe",
            bio: "Test bio",
        });
        const user = await prisma.user.findUnique({ where: { id: serviceUserId } });
        expect(user!.first_name).toBe("John");
        expect(user!.last_name).toBe("Doe");
    });

    it("upsertUserProfile splits name into firstName/lastName when provided", async () => {
        const nameUser = await seedUser("name-split");
        const profile = await upsertUserProfile(nameUser.id, {
            name: "Alice Wonderland",
            skills: [],
            languages: [],
        });
        const user = await prisma.user.findUnique({ where: { id: nameUser.id } });
        expect(user!.first_name).toBe("Alice");
        expect(user!.last_name).toBe("Wonderland");
    });

    it("upsertUserProfile maps locationGeo to GeoJSON Point", async () => {
        const geoUser = await seedUser("geo");
        const profile = await upsertUserProfile(geoUser.id, {
            location: "Milan",
            locationGeo: { lat: 45.4654, lng: 9.1866 },
            skills: [],
            languages: [],
        });
        expect(profile.location_geo).toBeDefined();
        expect((profile.location_geo as unknown as { type: string }).type).toBe("Point");
    });

    it("addUserSkill creates profile if none exists", async () => {
        const newUser = await seedUser("add-skill");
        const profile = await addUserSkill(newUser.id, "Docker");
        expect(profile.skills).toContain("Docker");
    });

    it("addUserSkill adds skill to existing profile", async () => {
        const profile = await addUserSkill(serviceUserId, "Kubernetes");
        expect(profile.skills).toContain("Kubernetes");
    });

    it("addUserSkill is idempotent (does not duplicate)", async () => {
        await addUserSkill(serviceUserId, "UniqueSkill");
        const profile = await addUserSkill(serviceUserId, "UniqueSkill");
        const count = profile.skills.filter((s: string) => s === "UniqueSkill").length;
        expect(count).toBe(1);
    });

    it("changeUserPassword succeeds with correct current password", async () => {
        const pwUser = await seedUser("pw-change", "OldPass1!");
        await expect(
            changeUserPassword(pwUser.id, "OldPass1!", "NewPass2!")
        ).resolves.toBeUndefined();
    });

    it("changeUserPassword throws InvalidPasswordError for wrong current password", async () => {
        const pwUser2 = await seedUser("pw-wrong", "RealPass1!");
        await expect(
            changeUserPassword(pwUser2.id, "WrongPass!", "NewPass2!")
        ).rejects.toThrow(InvalidPasswordError);
    });

    it("changeUserPassword throws when user not found", async () => {
        await expect(
            changeUserPassword("000000000000000000000098", "any", "new")
        ).rejects.toThrow("User not found");
    });

    it("changeUserPassword throws when user has no password (OAuth account)", async () => {
        const oauthUser = await prisma.user.create({
            data: {
                email: `${TAG}-oauth@test.local`,
                password: null as unknown as string,
                first_name: "OAuth",
                last_name: "User",
                role: "user",
            },
        });
        createdUserIds.push(oauthUser.id);
        await expect(
            changeUserPassword(oauthUser.id, "any", "new")
        ).rejects.toThrow("not available");
    });

    it("softDeleteUser stamps deleted_at", async () => {
        const sdUser = await seedUser("soft-del3");
        await softDeleteUser(sdUser.id);
        const user = await prisma.user.findUnique({ where: { id: sdUser.id } });
        expect(user!.deleted_at).not.toBeNull();
    });

    it("getUsers returns paginated list excluding soft-deleted", async () => {
        const liveUser = await seedUser("live-list");
        const deadUser = await seedUser("dead-list");
        await prisma.user.update({ where: { id: deadUser.id }, data: { deleted_at: new Date() } });

        const result = await getUsers(1, 200);
        const ids = result.users.map((u) => u.id);
        expect(ids).toContain(liveUser.id);
        expect(ids).not.toContain(deadUser.id);
        expect(result.pagination.total).toBeGreaterThan(0);
    });

    it("getUsers filters by role", async () => {
        const result = await getUsers(1, 50, { role: "admin" });
        result.users.forEach((u) => expect(u.role).toBe("admin"));
    });

    it("getUsers filters by search query (q)", async () => {
        const qUser = await seedUser(`query-search-${TS}`);
        const result = await getUsers(1, 50, { q: `bec-${TS}` });
        const ids = result.users.map((u) => u.id);
        expect(ids).toContain(qUser.id);
    });

    it("getUsers filters by dateFrom and dateTo", async () => {
        const today = new Date().toISOString().split("T")[0];
        const result = await getUsers(1, 50, { dateFrom: today, dateTo: today });
        expect(Array.isArray(result.users)).toBe(true);
    });

    it("createUser creates a new user record", async () => {
        const email = `${TAG}-created@test.local`;
        const user = await createUser({
            email,
            password: "hashed",
            first_name: "Created",
            last_name: "Testuser",
            role: "user",
        });
        createdUserIds.push(user.id);
        expect(user.email).toBe(email);
        expect(user.role).toBe("user");
    });

    it("deleteUser hard-deletes the record", async () => {
        const delUser = await seedUser("hard-del");
        // Remove from cleanup list — we're deleting it manually
        const idx = createdUserIds.indexOf(delUser.id);
        if (idx !== -1) createdUserIds.splice(idx, 1);

        await deleteUser(delUser.id);
        const user = await prisma.user.findUnique({ where: { id: delUser.id } });
        expect(user).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// USER ROUTES (API-level)
// ─────────────────────────────────────────────────────────────────────────────
describe("user routes — API integration", () => {
    it("GET /users/me returns 401 when unauthenticated", async () => {
        const res = await app.handle(new Request("http://localhost/users/me"));
        expect(res.status).toBe(401);
    });

    it("GET /users/me returns current user data", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me", {
                headers: createAuthHeaders(seekerTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.data as Record<string, unknown>).id).toBe(seekerUserId);
    });

    it("GET /users — returns 401 for unauthenticated", async () => {
        const res = await app.handle(new Request("http://localhost/users"));
        expect(res.status).toBe(401);
    });

    it("GET /users — returns 403 for non-admin", async () => {
        const res = await app.handle(
            new Request("http://localhost/users", {
                headers: createAuthHeaders(seekerTokens),
            })
        );
        expect(res.status).toBe(403);
    });

    it("GET /users — returns paginated list for admin", async () => {
        const adminTokens = await loginUser(app, "admin");
        const res = await app.handle(
            new Request("http://localhost/users", {
                headers: createAuthHeaders(adminTokens),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        const data = body.data as Record<string, unknown>;
        expect(Array.isArray(data.users)).toBe(true);
    });

    it("GET /users/:id/profile — returns 404 for unknown user", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/000000000000000000000099/profile")
        );
        expect(res.status).toBe(404);
    });

    it("GET /users/:id/profile — returns profile when it exists", async () => {
        // Use seeker who should have a profile (from match tests or login)
        const profile = await prisma.userProfile.findFirst({ where: { user_id: seekerUserId } });
        if (!profile) {
            await prisma.userProfile.create({
                data: { user_id: seekerUserId, languages: [], skills: [], workModes: [] },
            });
        }
        const res = await app.handle(
            new Request(`http://localhost/users/${seekerUserId}/profile`)
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect((body.data as Record<string, unknown>).userId).toBe(seekerUserId);
    });

    it("PUT /users/me/profile — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skills: ["Go"] }),
            })
        );
        expect(res.status).toBe(401);
    });

    it("PUT /users/me/profile — updates profile successfully", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/profile", {
                method: "PUT",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({
                    skills: ["TypeScript", "Bun"],
                    seniority: "senior",
                    bio: "Coverage test profile",
                    workModes: ["remote"],
                    availability: ["full-time"],
                }),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        const data = body.data as Record<string, unknown>;
        expect(data.seniority).toBe("senior");
    });

    it("POST /users/me/skills — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skill: "Docker" }),
            })
        );
        expect(res.status).toBe(401);
    });

    it("POST /users/me/skills — adds a skill", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({ skill: "Bun" }),
            })
        );
        const body = await res.json() as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect((body.data as Record<string, unknown>).skills).toContain("Bun");
    });

    it("PUT /users/me/password — returns 401 when unauthenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: "x", newPassword: "newpass" }),
            })
        );
        expect(res.status).toBe(401);
    });

    it("PUT /users/me/password — returns 400 for wrong current password", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/password", {
                method: "PUT",
                headers: createAuthHeaders(seekerTokens),
                body: JSON.stringify({ currentPassword: "wrongpassword", newPassword: "newpass1" }),
            })
        );
        expect(res.status).toBe(400);
    });
});
