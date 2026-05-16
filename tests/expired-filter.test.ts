import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { prisma, setupDatabase } from "../src/config/database";
import { loginUser, type AuthTokens } from "./helpers/auth";
import logger from "../src/utils/logger";

/**
 * Verifies §I.4 default-exclude behavior on `GET /jobs`:
 *   - active + draft jobs appear in the public listing.
 *   - expired jobs never appear unless an admin caller passes
 *     `?include_expired=true`.
 *   - a non-admin passing the param is silently ignored (server-side gate).
 */

const COMPANY_NAME = "Expired Filter Test Co";
const TITLES = {
    active: "[expired-filter-test] Active Job",
    expired: "[expired-filter-test] Expired Job",
    draft: "[expired-filter-test] Draft Job"
} as const;

interface JobRow {
    id: string;
    title: string;
    status?: string | null;
}

interface JobsResponse {
    success: boolean;
    status: number;
    message: string;
    data: {
        jobs: JobRow[];
        pagination: { page: number; limit: number; total: number; pages: number };
    };
}

let companyId: string;
let adminTokens: AuthTokens;
let seekerTokens: AuthTokens;

const cleanup = async () => {
    const jobs = await prisma.job.findMany({
        where: { title: { in: Object.values(TITLES) } },
        select: { id: true }
    });
    const ids = jobs.map(j => j.id);
    if (ids.length > 0) {
        await prisma.favorite.deleteMany({ where: { job_id: { in: ids } } });
        await prisma.job.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.company.deleteMany({ where: { name: COMPANY_NAME } });
};

const fetchJobs = async (
    params: Record<string, string>,
    token?: string
): Promise<JobsResponse> => {
    const search = new URLSearchParams(params).toString();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await app.handle(
        new Request(`http://localhost/jobs?${search}`, { headers })
    );
    return (await response.json()) as JobsResponse;
};

beforeAll(async () => {
    await setupDatabase();
    await cleanup();

    const company = await prisma.company.create({
        data: { name: COMPANY_NAME, description: "Test company for expired filter" }
    });
    companyId = company.id;

    try {
        adminTokens = await loginUser(app, "admin");
        seekerTokens = await loginUser(app, "jobSeeker");
    } catch (error) {
        logger.error({ err: error }, "Failed to set up test auth tokens");
        throw error;
    }

    await prisma.job.create({
        data: {
            company_id: companyId,
            title: TITLES.active,
            description: "Active job for expired-filter test",
            status: "active",
            skills: [],
            requirements: [],
            benefits: []
        }
    });
    await prisma.job.create({
        data: {
            company_id: companyId,
            title: TITLES.expired,
            description: "Expired job for expired-filter test",
            status: "expired",
            skills: [],
            requirements: [],
            benefits: []
        }
    });
    await prisma.job.create({
        data: {
            company_id: companyId,
            title: TITLES.draft,
            description: "Draft job for expired-filter test",
            status: "draft",
            skills: [],
            requirements: [],
            benefits: []
        }
    });
});

afterAll(async () => {
    await cleanup();
});

const titlesInResponse = (jobs: JobRow[]): string[] =>
    jobs
        .map(j => j.title)
        .filter(t =>
            (Object.values(TITLES) as string[]).includes(t)
        );

describe("GET /jobs — expired filter (§I.4 contract)", () => {
    it("excludes expired jobs by default for anonymous callers", async () => {
        const body = await fetchJobs({ company_id: companyId, limit: "100" });
        expect(body.success).toBe(true);
        const titles = titlesInResponse(body.data.jobs);
        expect(titles).toContain(TITLES.active);
        expect(titles).toContain(TITLES.draft);
        expect(titles).not.toContain(TITLES.expired);
    });

    it("excludes expired jobs by default for authenticated non-admin callers", async () => {
        const body = await fetchJobs(
            { company_id: companyId, limit: "100" },
            seekerTokens.token
        );
        const titles = titlesInResponse(body.data.jobs);
        expect(titles).not.toContain(TITLES.expired);
    });

    it("ignores include_expired=true for non-admin callers (server-side gate)", async () => {
        const body = await fetchJobs(
            { company_id: companyId, limit: "100", include_expired: "true" },
            seekerTokens.token
        );
        const titles = titlesInResponse(body.data.jobs);
        expect(titles).not.toContain(TITLES.expired);
    });

    it("includes expired jobs for admin caller with include_expired=true", async () => {
        const body = await fetchJobs(
            { company_id: companyId, limit: "100", include_expired: "true" },
            adminTokens.token
        );
        const titles = titlesInResponse(body.data.jobs);
        expect(titles).toContain(TITLES.active);
        expect(titles).toContain(TITLES.expired);
        expect(titles).toContain(TITLES.draft);
    });

    it("narrows to a single status when explicit `status` is passed by admin", async () => {
        const body = await fetchJobs(
            { company_id: companyId, limit: "100", status: "expired" },
            adminTokens.token
        );
        const titles = titlesInResponse(body.data.jobs);
        expect(titles).toEqual([TITLES.expired]);
    });
});
