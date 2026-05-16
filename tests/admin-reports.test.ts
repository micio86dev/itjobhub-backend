import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { prisma, setupDatabase } from "../src/config/database";
import { getMongoDb, closeMongoClient } from "../src/lib/mongo";
import { loginUser, type AuthTokens } from "./helpers/auth";
import logger from "../src/utils/logger";

/**
 * Locked contract tests for §I.5 admin report endpoints.
 *
 * Each test asserts:
 *   - the response shape matches the locked schema (field names + types);
 *   - RBAC denies non-admin callers with 403;
 *   - pagination metadata is present where required.
 */

const REPORT_ID_PRIMARY = "test-report-primary-" + Date.now().toString(36);
const REPORT_ID_SECONDARY = "test-report-secondary-" + Date.now().toString(36);
const TEST_TAG = "[admin-reports-test]";
const COMPANY_NAME = `${TEST_TAG} Co`;

let adminTokens: AuthTokens;
let seekerTokens: AuthTokens;
let expiredJobId: string;

interface ApiResponse<T> {
    success: boolean;
    status: number;
    message: string;
    data?: T;
    errors?: object | string;
}

interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

interface ImportReportListItem {
    id: string;
    run_id: string;
    started_at: string;
    finished_at: string | null;
    duration_seconds: number | null;
    ai_model: string;
    triggered_by: string;
    total_sources: number;
    total_fetched: number;
    total_upserted: number;
    total_failed_quality: number;
    total_url_invalid: number;
    total_expired_detected: number;
    status: "success" | "partial" | "failed";
}

interface ImportRunSource {
    id: string;
    provider_name: string;
    language_target: string | null;
    started_at: string;
    completed_at: string | null;
    jobs_fetched: number;
    jobs_stored: number;
    passed_quality_gate: number;
    soft_404_count: number;
    url_invalid_count: number;
    avg_enrichment_ms: number;
    quality_score: number;
    connector_crashed: boolean;
    crash_reason: string | null;
    failure_reasons: Record<string, number>;
}

interface ReportDetail {
    report: ImportReportListItem & {
        language_targets: string[];
        failure_reasons: Record<string, number>;
        avg_enrichment_ms: number;
        errors: string[];
    };
    sources: ImportRunSource[];
}

interface LeaderboardRow {
    provider_name: string;
    language_target: string | null;
    runs: number;
    total_stored: number;
    avg_quality_score: number;
    trend: "improving" | "declining" | "stable";
}

interface FailureBreakdownResponse {
    totals: Array<{ reason: string; count: number }>;
    by_source: Array<{
        provider_name: string;
        top: Array<{ reason: string; count: number }>;
    }>;
    window: { from: string; to: string };
}

interface ExpiredJobItem {
    id: string;
    title: string;
    source: string;
    url: string;
    expired_at: string;
    detection_reason: string;
}

interface RecheckResult {
    alive: boolean;
    new_status: "active" | "expired";
    status_code: number | null;
}

const callApi = async <T>(
    method: "GET" | "POST",
    path: string,
    token?: string
): Promise<{ status: number; body: ApiResponse<T> }> => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await app.handle(
        new Request(`http://localhost${path}`, { method, headers })
    );
    const body = (await response.json()) as ApiResponse<T>;
    return { status: response.status, body };
};

const cleanup = async () => {
    const db = await getMongoDb();
    await db.collection("import_reports").deleteMany({
        run_id: { $in: [REPORT_ID_PRIMARY, REPORT_ID_SECONDARY] }
    });
    await db.collection("import_runs").deleteMany({
        report_id: { $in: [REPORT_ID_PRIMARY, REPORT_ID_SECONDARY] }
    });

    const jobs = await prisma.job.findMany({
        where: { title: { startsWith: TEST_TAG } },
        select: { id: true }
    });
    const ids = jobs.map(j => j.id);
    if (ids.length > 0) {
        await prisma.favorite.deleteMany({ where: { job_id: { in: ids } } });
        await prisma.job.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.company.deleteMany({ where: { name: COMPANY_NAME } });
};

beforeAll(async () => {
    await setupDatabase();
    await cleanup();

    try {
        adminTokens = await loginUser(app, "admin");
        seekerTokens = await loginUser(app, "jobSeeker");
    } catch (error) {
        logger.error({ err: error }, "Failed to set up test auth tokens");
        throw error;
    }

    // Seed two import_reports — one finished cleanly, one with a crashed source.
    const db = await getMongoDb();
    const reportsCol = db.collection("import_reports");
    const runsCol = db.collection("import_runs");

    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

    await reportsCol.insertMany([
        {
            run_id: REPORT_ID_PRIMARY,
            started_at: minutesAgo(40),
            finished_at: minutesAgo(30),
            ai_model: "llama-3.1-8b-instant",
            triggered_by: "cli",
            language_targets: ["it", "en"],
            total_sources: 2,
            total_fetched: 50,
            total_passed_quality: 40,
            total_failed_quality: 10,
            total_upserted: 30,
            total_skipped_duplicate: 10,
            total_url_invalid: 5,
            total_expired_detected: 2,
            failure_reasons: { ZERO_SKILLS: 6, DESCRIPTION_INVALID: 4 },
            avg_enrichment_ms: 120.5,
            errors: ["timeout connecting"]
        },
        {
            run_id: REPORT_ID_SECONDARY,
            started_at: minutesAgo(120),
            finished_at: minutesAgo(110),
            ai_model: "llama-3.1-8b-instant",
            triggered_by: "cron",
            language_targets: ["it"],
            total_sources: 1,
            total_fetched: 20,
            total_passed_quality: 18,
            total_failed_quality: 2,
            total_upserted: 18,
            total_skipped_duplicate: 0,
            total_url_invalid: 1,
            total_expired_detected: 0,
            failure_reasons: { MISSING_COMPANY: 2 },
            avg_enrichment_ms: 95.0,
            errors: []
        }
    ]);

    await runsCol.insertMany([
        {
            report_id: REPORT_ID_PRIMARY,
            provider_name: "adzuna",
            language_target: "it",
            started_at: minutesAgo(40),
            completed_at: minutesAgo(35),
            jobs_fetched: 30,
            jobs_stored: 20,
            passed_quality_gate: 25,
            soft_404_count: 1,
            url_invalid_count: 2,
            avg_enrichment_ms: 110.0,
            quality_score: 0.82,
            connector_crashed: false,
            crash_reason: null,
            failure_reasons: { ZERO_SKILLS: 3 },
            errors: []
        },
        {
            report_id: REPORT_ID_PRIMARY,
            provider_name: "greenhouse",
            language_target: "en",
            started_at: minutesAgo(38),
            completed_at: minutesAgo(31),
            jobs_fetched: 20,
            jobs_stored: 10,
            passed_quality_gate: 15,
            soft_404_count: 2,
            url_invalid_count: 3,
            avg_enrichment_ms: 130.0,
            quality_score: 0.65,
            connector_crashed: true,
            crash_reason: "RuntimeError('connector died')",
            failure_reasons: { DESCRIPTION_INVALID: 4, ZERO_SKILLS: 3 },
            errors: ["RuntimeError"]
        },
        {
            report_id: REPORT_ID_SECONDARY,
            provider_name: "adzuna",
            language_target: "it",
            started_at: minutesAgo(120),
            completed_at: minutesAgo(115),
            jobs_fetched: 20,
            jobs_stored: 18,
            passed_quality_gate: 18,
            soft_404_count: 0,
            url_invalid_count: 1,
            avg_enrichment_ms: 95.0,
            quality_score: 0.95,
            connector_crashed: false,
            crash_reason: null,
            failure_reasons: { MISSING_COMPANY: 2 },
            errors: []
        }
    ]);

    // Seed an expired job for URL health + recheck.
    const company = await prisma.company.create({
        data: { name: COMPANY_NAME, description: "Admin reports fixtures" }
    });
    const expired = await prisma.job.create({
        data: {
            company_id: company.id,
            title: `${TEST_TAG} Expired Position`,
            description: "Seeded expired job",
            status: "expired",
            source: "adzuna",
            source_provider: "adzuna",
            link: "https://example.com/dead-listing-12345",
            skills: [],
            requirements: [],
            benefits: []
        }
    });
    expiredJobId = expired.id;
});

afterAll(async () => {
    await cleanup();
    await closeMongoClient();
});

describe("GET /admin/reports/import-runs", () => {
    it("returns 401 when no token is supplied", async () => {
        const { status } = await callApi("GET", "/admin/reports/import-runs");
        expect(status).toBe(401);
    });

    it("returns 403 for a non-admin caller", async () => {
        const { status } = await callApi(
            "GET",
            "/admin/reports/import-runs",
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("returns paginated reports with the §I.5 list shape", async () => {
        const { status, body } = await callApi<{
            items: ImportReportListItem[];
            pagination: PaginationMeta;
        }>("GET", "/admin/reports/import-runs?page=1&limit=10", adminTokens.token);
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");

        expect(Array.isArray(data.items)).toBe(true);
        expect(data.pagination).toMatchObject({
            page: 1,
            limit: 10,
            total: expect.any(Number),
            pages: expect.any(Number)
        });

        const seeded = data.items.find(i => i.run_id === REPORT_ID_PRIMARY);
        expect(seeded).toBeDefined();
        if (!seeded) return;
        expect(seeded).toMatchObject({
            id: expect.any(String),
            run_id: REPORT_ID_PRIMARY,
            ai_model: "llama-3.1-8b-instant",
            triggered_by: "cli",
            total_sources: 2,
            total_fetched: 50,
            total_upserted: 30,
            total_failed_quality: 10,
            total_url_invalid: 5,
            total_expired_detected: 2,
            duration_seconds: expect.any(Number)
        });
        expect(typeof seeded.started_at).toBe("string");
        expect(["success", "partial", "failed"]).toContain(seeded.status);
        // PRIMARY has a crashed source → must be flagged "partial".
        expect(seeded.status).toBe("partial");
    });
});

describe("GET /admin/reports/import-runs/:id", () => {
    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "GET",
            `/admin/reports/import-runs/${REPORT_ID_PRIMARY}`,
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("returns report + sources matching §I.5 detail shape", async () => {
        const { status, body } = await callApi<ReportDetail>(
            "GET",
            `/admin/reports/import-runs/${REPORT_ID_PRIMARY}`,
            adminTokens.token
        );
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");

        expect(data.report.run_id).toBe(REPORT_ID_PRIMARY);
        expect(data.report.language_targets).toEqual(["it", "en"]);
        expect(data.report.failure_reasons).toMatchObject({
            ZERO_SKILLS: 6,
            DESCRIPTION_INVALID: 4
        });
        expect(data.report.avg_enrichment_ms).toBe(120.5);
        expect(Array.isArray(data.report.errors)).toBe(true);

        expect(data.sources).toHaveLength(2);
        const adzuna = data.sources.find(s => s.provider_name === "adzuna");
        const greenhouse = data.sources.find(s => s.provider_name === "greenhouse");
        if (!adzuna || !greenhouse) throw new Error("missing seeded sources");

        expect(adzuna).toMatchObject({
            id: expect.any(String),
            provider_name: "adzuna",
            language_target: "it",
            jobs_fetched: 30,
            jobs_stored: 20,
            passed_quality_gate: 25,
            soft_404_count: 1,
            url_invalid_count: 2,
            avg_enrichment_ms: 110,
            quality_score: 0.82,
            connector_crashed: false
        });
        expect(greenhouse.connector_crashed).toBe(true);
        expect(greenhouse.crash_reason).toContain("RuntimeError");
    });
});

describe("GET /admin/reports/sources/leaderboard", () => {
    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "GET",
            "/admin/reports/sources/leaderboard",
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("aggregates per-source quality with the §I.5 shape", async () => {
        const { status, body } = await callApi<LeaderboardRow[]>(
            "GET",
            "/admin/reports/sources/leaderboard?days=7",
            adminTokens.token
        );
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");
        expect(Array.isArray(data)).toBe(true);

        const adzuna = data.find(
            r => r.provider_name === "adzuna" && r.language_target === "it"
        );
        if (!adzuna) throw new Error("seeded adzuna leaderboard row missing");

        expect(adzuna).toMatchObject({
            provider_name: "adzuna",
            language_target: "it",
            runs: expect.any(Number),
            total_stored: expect.any(Number),
            avg_quality_score: expect.any(Number)
        });
        expect(["improving", "declining", "stable"]).toContain(adzuna.trend);
    });
});

describe("GET /admin/reports/failures/breakdown", () => {
    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "GET",
            "/admin/reports/failures/breakdown",
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("returns totals + by_source + window per §I.5", async () => {
        const { status, body } = await callApi<FailureBreakdownResponse>(
            "GET",
            "/admin/reports/failures/breakdown",
            adminTokens.token
        );
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");

        expect(Array.isArray(data.totals)).toBe(true);
        expect(Array.isArray(data.by_source)).toBe(true);
        expect(data.window).toMatchObject({
            from: expect.any(String),
            to: expect.any(String)
        });

        const zeroSkills = data.totals.find(t => t.reason === "ZERO_SKILLS");
        expect(zeroSkills?.count).toBeGreaterThanOrEqual(6);

        const greenhouseRow = data.by_source.find(s => s.provider_name === "greenhouse");
        expect(greenhouseRow).toBeDefined();
        if (greenhouseRow) {
            expect(Array.isArray(greenhouseRow.top)).toBe(true);
            expect(greenhouseRow.top.length).toBeGreaterThan(0);
            expect(greenhouseRow.top[0]).toMatchObject({
                reason: expect.any(String),
                count: expect.any(Number)
            });
        }
    });
});

describe("GET /admin/reports/url-health", () => {
    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "GET",
            "/admin/reports/url-health",
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("returns paginated expired jobs with the §I.5 shape", async () => {
        const { status, body } = await callApi<{
            items: ExpiredJobItem[];
            pagination: PaginationMeta;
        }>("GET", "/admin/reports/url-health?page=1&limit=25", adminTokens.token);
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");

        expect(Array.isArray(data.items)).toBe(true);
        expect(data.pagination).toMatchObject({
            page: 1,
            limit: 25,
            total: expect.any(Number),
            pages: expect.any(Number)
        });

        const seeded = data.items.find(i => i.id === expiredJobId);
        expect(seeded).toBeDefined();
        if (!seeded) return;
        expect(seeded).toMatchObject({
            id: expiredJobId,
            title: expect.stringContaining(TEST_TAG),
            source: "adzuna",
            url: "https://example.com/dead-listing-12345",
            expired_at: expect.any(String),
            detection_reason: expect.any(String)
        });
    });
});

describe("POST /admin/reports/url-health/:jobId/recheck", () => {
    it("returns 403 for non-admin", async () => {
        const { status } = await callApi(
            "POST",
            `/admin/reports/url-health/${expiredJobId}/recheck`,
            seekerTokens.token
        );
        expect(status).toBe(403);
    });

    it("returns recheck shape and persists the new status", async () => {
        const { status, body } = await callApi<RecheckResult>(
            "POST",
            `/admin/reports/url-health/${expiredJobId}/recheck`,
            adminTokens.token
        );
        expect(status).toBe(200);
        const data = body.data;
        if (!data) throw new Error("missing data");
        expect(typeof data.alive).toBe("boolean");
        expect(["active", "expired"]).toContain(data.new_status);
        expect(
            data.status_code === null || typeof data.status_code === "number"
        ).toBe(true);

        const fresh = await prisma.job.findUnique({
            where: { id: expiredJobId },
            select: { status: true }
        });
        expect(fresh?.status).toBe(data.new_status);
    });

    it("returns 404 when the job does not exist", async () => {
        const { status } = await callApi(
            "POST",
            `/admin/reports/url-health/65b00000000000000000beef/recheck`,
            adminTokens.token
        );
        expect(status).toBe(404);
    });
});
