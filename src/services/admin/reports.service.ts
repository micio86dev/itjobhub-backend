import { prisma as dbClient } from "../../config/database";
import { getMongoDb } from "../../lib/mongo";
import logger from "../../utils/logger";
import { HIDDEN_PUBLIC_STATUSES } from "../../types/job-status";

/* ------------------------------------------------------------------ */
/* Shared types matching §I.5 of the SDD plan (locked contract).      */
/* ------------------------------------------------------------------ */

export type ImportReportStatus = "success" | "partial" | "failed";

export interface ImportReportListItem {
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
    status: ImportReportStatus;
}

export interface ImportReportDetail extends ImportReportListItem {
    language_targets: string[];
    failure_reasons: Record<string, number>;
    avg_enrichment_ms: number;
    errors: string[];
}

export interface ImportRunSource {
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

export interface ReportWithSources {
    report: ImportReportDetail;
    sources: ImportRunSource[];
}

export type LeaderboardTrend = "improving" | "declining" | "stable";

export interface LeaderboardRow {
    provider_name: string;
    language_target: string | null;
    runs: number;
    total_stored: number;
    avg_quality_score: number;
    trend: LeaderboardTrend;
}

export interface FailureBreakdownTotal {
    reason: string;
    count: number;
}

export interface FailureBreakdownBySource {
    provider_name: string;
    top: FailureBreakdownTotal[];
}

export interface FailureBreakdown {
    totals: FailureBreakdownTotal[];
    by_source: FailureBreakdownBySource[];
    window: { from: string; to: string };
}

export interface ExpiredJobItem {
    id: string;
    title: string;
    source: string;
    url: string;
    expired_at: string;
    detection_reason: string;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface RecheckResult {
    alive: boolean;
    new_status: "active" | "expired";
    status_code: number | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type RawObjectId = { toString(): string };

interface RawImportReport {
    _id: RawObjectId;
    run_id?: string;
    started_at?: Date | string | null;
    finished_at?: Date | string | null;
    ai_model?: string;
    triggered_by?: string;
    language_targets?: string[];
    total_sources?: number;
    total_fetched?: number;
    total_upserted?: number;
    total_passed_quality?: number;
    total_failed_quality?: number;
    total_url_invalid?: number;
    total_expired_detected?: number;
    total_skipped_duplicate?: number;
    failure_reasons?: Record<string, number>;
    avg_enrichment_ms?: number;
    errors?: string[];
}

interface RawImportRun {
    _id: RawObjectId;
    report_id?: string | null;
    provider_name?: string;
    language_target?: string | null;
    started_at?: Date | string | null;
    completed_at?: Date | string | null;
    jobs_fetched?: number;
    jobs_stored?: number;
    passed_quality_gate?: number;
    soft_404_count?: number;
    url_invalid_count?: number;
    avg_enrichment_ms?: number;
    quality_score?: number;
    connector_crashed?: boolean;
    crash_reason?: string | null;
    failure_reasons?: Record<string, number>;
    errors?: string[];
}

const REPORT_STALE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h — past this without finished_at = "failed"

const toIso = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const computeDurationSeconds = (
    started: Date | string | null | undefined,
    finished: Date | string | null | undefined
): number | null => {
    if (!started || !finished) return null;
    const s = new Date(started).getTime();
    const f = new Date(finished).getTime();
    if (Number.isNaN(s) || Number.isNaN(f)) return null;
    return Math.max(0, Math.round((f - s) / 1000));
};

const deriveReportStatus = (
    report: RawImportReport,
    sources: RawImportRun[]
): ImportReportStatus => {
    const anyCrashed = sources.some(s => s.connector_crashed === true);
    const finished = report.finished_at ? new Date(report.finished_at) : null;
    const started = report.started_at ? new Date(report.started_at) : null;

    if (!finished) {
        if (started && Date.now() - started.getTime() > REPORT_STALE_TIMEOUT_MS) {
            return "failed";
        }
        // Still running — treat as partial; the dashboard renders a badge.
        return "partial";
    }
    if (anyCrashed) return "partial";
    return "success";
};

const mapReportRowBase = (
    report: RawImportReport,
    sources: RawImportRun[]
): ImportReportListItem => ({
    id: report._id.toString(),
    run_id: report.run_id ?? "",
    started_at: toIso(report.started_at) ?? new Date(0).toISOString(),
    finished_at: toIso(report.finished_at),
    duration_seconds: computeDurationSeconds(report.started_at, report.finished_at),
    ai_model: report.ai_model ?? "",
    triggered_by: report.triggered_by ?? "cli",
    total_sources: report.total_sources ?? 0,
    total_fetched: report.total_fetched ?? 0,
    total_upserted: report.total_upserted ?? 0,
    total_failed_quality: report.total_failed_quality ?? 0,
    total_url_invalid: report.total_url_invalid ?? 0,
    total_expired_detected: report.total_expired_detected ?? 0,
    status: deriveReportStatus(report, sources)
});

const mapSourceRow = (run: RawImportRun): ImportRunSource => ({
    id: run._id.toString(),
    provider_name: run.provider_name ?? "",
    language_target: run.language_target ?? null,
    started_at: toIso(run.started_at) ?? new Date(0).toISOString(),
    completed_at: toIso(run.completed_at),
    jobs_fetched: run.jobs_fetched ?? 0,
    jobs_stored: run.jobs_stored ?? 0,
    passed_quality_gate: run.passed_quality_gate ?? 0,
    soft_404_count: run.soft_404_count ?? 0,
    url_invalid_count: run.url_invalid_count ?? 0,
    avg_enrichment_ms: run.avg_enrichment_ms ?? 0,
    quality_score: run.quality_score ?? 0,
    connector_crashed: run.connector_crashed ?? false,
    crash_reason: run.crash_reason ?? null,
    failure_reasons: run.failure_reasons ?? {}
});

const parseDateBoundary = (value: string | undefined): Date | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
};

/* ------------------------------------------------------------------ */
/* Endpoint implementations                                           */
/* ------------------------------------------------------------------ */

export const listReports = async (opts: {
    page: number;
    limit: number;
    from?: string;
    to?: string;
}): Promise<{ items: ImportReportListItem[]; pagination: PaginationMeta }> => {
    const db = await getMongoDb();
    const collection = db.collection<RawImportReport>("import_reports");
    const runsCollection = db.collection<RawImportRun>("import_runs");

    const startedAtFilter: Record<string, Date> = {};
    const from = parseDateBoundary(opts.from);
    const to = parseDateBoundary(opts.to);
    if (from) startedAtFilter.$gte = from;
    if (to) startedAtFilter.$lte = to;
    const match: Record<string, unknown> = {};
    if (Object.keys(startedAtFilter).length > 0) {
        match.started_at = startedAtFilter;
    }

    const skip = Math.max(0, (opts.page - 1) * opts.limit);

    const [rawReports, total] = await Promise.all([
        collection
            .find(match)
            .sort({ started_at: -1 })
            .skip(skip)
            .limit(opts.limit)
            .toArray(),
        collection.countDocuments(match)
    ]);

    // Pull crash flags in one batch so we can derive each report's status.
    const runIds = rawReports.map(r => r.run_id).filter((v): v is string => Boolean(v));
    const sourceMap = new Map<string, RawImportRun[]>();
    if (runIds.length > 0) {
        const sources = await runsCollection
            .find(
                { report_id: { $in: runIds } },
                { projection: { report_id: 1, connector_crashed: 1 } }
            )
            .toArray();
        for (const src of sources) {
            const rid = src.report_id ?? "";
            const bucket = sourceMap.get(rid) ?? [];
            bucket.push(src);
            sourceMap.set(rid, bucket);
        }
    }

    const items = rawReports.map(r =>
        mapReportRowBase(r, sourceMap.get(r.run_id ?? "") ?? [])
    );

    return {
        items,
        pagination: {
            page: opts.page,
            limit: opts.limit,
            total,
            pages: opts.limit > 0 ? Math.ceil(total / opts.limit) : 0
        }
    };
};

export const getReportWithSources = async (
    id: string
): Promise<ReportWithSources | null> => {
    const db = await getMongoDb();
    const reportsCol = db.collection<RawImportReport>("import_reports");
    const runsCol = db.collection<RawImportRun>("import_runs");

    // Allow lookup by either Mongo ObjectId or the `run_id` uuid hex.
    let report: RawImportReport | null = null;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
        const { ObjectId } = await import("mongodb");
        // Use the untyped collection for the ObjectId lookup so the driver
        // accepts the BSON _id filter without a wide overload signature.
        const rawCol = db.collection("import_reports");
        const found = await rawCol.findOne({ _id: new ObjectId(id) });
        report = (found as RawImportReport | null) ?? null;
    }
    if (!report) {
        report = await reportsCol.findOne({ run_id: id });
    }
    if (!report) return null;

    const sources = report.run_id
        ? await runsCol
              .find({ report_id: report.run_id })
              .sort({ started_at: 1 })
              .toArray()
        : [];

    const base = mapReportRowBase(report, sources);

    return {
        report: {
            ...base,
            language_targets: report.language_targets ?? [],
            failure_reasons: report.failure_reasons ?? {},
            avg_enrichment_ms: report.avg_enrichment_ms ?? 0,
            errors: report.errors ?? []
        },
        sources: sources.map(mapSourceRow)
    };
};

const computeTrend = (
    qualityScores: number[]
): LeaderboardTrend => {
    if (qualityScores.length < 3) return "stable";
    const half = Math.floor(qualityScores.length / 2);
    const olderAvg =
        qualityScores.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
    const recent = qualityScores.slice(-half);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const delta = recentAvg - olderAvg;
    if (delta > 0.05) return "improving";
    if (delta < -0.05) return "declining";
    return "stable";
};

export const sourceLeaderboard = async (opts: {
    language?: string;
    days: number;
}): Promise<LeaderboardRow[]> => {
    const db = await getMongoDb();
    const runsCol = db.collection<RawImportRun>("import_runs");

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, opts.days));

    const match: Record<string, unknown> = { started_at: { $gte: cutoff } };
    if (opts.language) match.language_target = opts.language;

    const rows = await runsCol
        .find(match, {
            projection: {
                provider_name: 1,
                language_target: 1,
                jobs_stored: 1,
                quality_score: 1,
                started_at: 1
            }
        })
        .sort({ started_at: 1 })
        .toArray();

    type Bucket = {
        provider_name: string;
        language_target: string | null;
        runs: number;
        total_stored: number;
        quality_scores: number[];
    };

    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
        const provider = r.provider_name ?? "unknown";
        const lang = r.language_target ?? null;
        const key = `${provider}::${lang ?? "_"}`;
        const bucket = buckets.get(key) ?? {
            provider_name: provider,
            language_target: lang,
            runs: 0,
            total_stored: 0,
            quality_scores: []
        };
        bucket.runs += 1;
        bucket.total_stored += r.jobs_stored ?? 0;
        if (typeof r.quality_score === "number") {
            bucket.quality_scores.push(r.quality_score);
        }
        buckets.set(key, bucket);
    }

    const result: LeaderboardRow[] = Array.from(buckets.values()).map(b => {
        const avg =
            b.quality_scores.length > 0
                ? b.quality_scores.reduce((a, c) => a + c, 0) / b.quality_scores.length
                : 0;
        return {
            provider_name: b.provider_name,
            language_target: b.language_target,
            runs: b.runs,
            total_stored: b.total_stored,
            avg_quality_score: Number(avg.toFixed(4)),
            trend: computeTrend(b.quality_scores)
        };
    });

    result.sort((a, b) => b.avg_quality_score - a.avg_quality_score);
    return result;
};

export const failureBreakdown = async (opts: {
    from?: string;
    to?: string;
}): Promise<FailureBreakdown> => {
    const db = await getMongoDb();
    const reportsCol = db.collection<RawImportReport>("import_reports");
    const runsCol = db.collection<RawImportRun>("import_runs");

    const from = parseDateBoundary(opts.from);
    const to = parseDateBoundary(opts.to);

    const reportFilter: Record<string, unknown> = {};
    const runFilter: Record<string, unknown> = {};
    const startedAt: Record<string, Date> = {};
    if (from) startedAt.$gte = from;
    if (to) startedAt.$lte = to;
    if (Object.keys(startedAt).length > 0) {
        reportFilter.started_at = startedAt;
        runFilter.started_at = startedAt;
    }

    // Totals — sum from `import_reports.failure_reasons` (already aggregated
    // scraper-side per CLI invocation).
    const reports = await reportsCol
        .find(reportFilter, { projection: { failure_reasons: 1 } })
        .toArray();

    const totalsMap = new Map<string, number>();
    for (const r of reports) {
        for (const [reason, count] of Object.entries(r.failure_reasons ?? {})) {
            totalsMap.set(reason, (totalsMap.get(reason) ?? 0) + (count ?? 0));
        }
    }

    const totals: FailureBreakdownTotal[] = Array.from(totalsMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

    // Per-source breakdown — pull each source's failure_reasons and bucket by provider.
    const runs = await runsCol
        .find(runFilter, {
            projection: { provider_name: 1, failure_reasons: 1 }
        })
        .toArray();

    const perSource = new Map<string, Map<string, number>>();
    for (const run of runs) {
        const provider = run.provider_name ?? "unknown";
        const bucket = perSource.get(provider) ?? new Map<string, number>();
        for (const [reason, count] of Object.entries(run.failure_reasons ?? {})) {
            bucket.set(reason, (bucket.get(reason) ?? 0) + (count ?? 0));
        }
        perSource.set(provider, bucket);
    }

    const by_source: FailureBreakdownBySource[] = Array.from(perSource.entries())
        .map(([provider_name, reasonsMap]) => ({
            provider_name,
            top: Array.from(reasonsMap.entries())
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
        }))
        .sort((a, b) => {
            const aTotal = a.top.reduce((acc, t) => acc + t.count, 0);
            const bTotal = b.top.reduce((acc, t) => acc + t.count, 0);
            return bTotal - aTotal;
        });

    return {
        totals,
        by_source,
        window: {
            from: (from ?? new Date(0)).toISOString(),
            to: (to ?? new Date()).toISOString()
        }
    };
};

export const listExpiredJobs = async (opts: {
    page: number;
    limit: number;
}): Promise<{ items: ExpiredJobItem[]; pagination: PaginationMeta }> => {
    const skip = Math.max(0, (opts.page - 1) * opts.limit);

    const [rows, total] = await Promise.all([
        dbClient.job.findMany({
            where: { status: "expired" },
            orderBy: { updated_at: "desc" },
            skip,
            take: opts.limit,
            select: {
                id: true,
                title: true,
                source: true,
                source_provider: true,
                link: true,
                expires_at: true,
                updated_at: true,
                created_at: true
            }
        }),
        dbClient.job.count({ where: { status: "expired" } })
    ]);

    const items: ExpiredJobItem[] = rows.map(j => ({
        id: j.id,
        title: j.title,
        source: j.source_provider ?? j.source ?? "unknown",
        url: j.link ?? "",
        expired_at: (j.expires_at ?? j.updated_at ?? j.created_at ?? new Date()).toISOString(),
        // Stored detection reason is not surfaced on the Job model today; the
        // scraper persists the reason in `quality.reject_reason` (out of the
        // Prisma surface). Until that field is migrated we expose a generic
        // marker so the dashboard column is always populated.
        detection_reason: "expired"
    }));

    return {
        items,
        pagination: {
            page: opts.page,
            limit: opts.limit,
            total,
            pages: opts.limit > 0 ? Math.ceil(total / opts.limit) : 0
        }
    };
};

export const recheckJobUrl = async (jobId: string): Promise<RecheckResult> => {
    const job = await dbClient.job.findUnique({
        where: { id: jobId },
        select: { id: true, link: true, status: true }
    });
    if (!job) {
        throw new Error("Job not found");
    }
    if (!job.link) {
        return { alive: false, new_status: job.status === "expired" ? "expired" : "expired", status_code: null };
    }

    let statusCode: number | null = null;
    let alive = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetch(job.link, {
            method: "HEAD",
            redirect: "follow",
            signal: controller.signal
        });
        statusCode = response.status;
        alive = response.status >= 200 && response.status < 400;
    } catch (error) {
        logger.warn({ err: error, jobId, url: job.link }, "URL recheck failed");
        alive = false;
        statusCode = null;
    } finally {
        clearTimeout(timeoutId);
    }

    let newStatus: "active" | "expired";
    if (alive) {
        newStatus = "active";
        if (job.status !== "active") {
            await dbClient.job.update({
                where: { id: jobId },
                data: { status: "active" }
            });
        }
    } else {
        newStatus = "expired";
        if (job.status !== "expired") {
            await dbClient.job.update({
                where: { id: jobId },
                data: { status: "expired" }
            });
        }
    }

    return { alive, new_status: newStatus, status_code: statusCode };
};

// Re-export the controlled hidden-status list so route-level docs can rely on it.
export { HIDDEN_PUBLIC_STATUSES };
