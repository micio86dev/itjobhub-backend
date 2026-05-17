import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import {
    listReports,
    getReportWithSources,
    sourceLeaderboard,
    failureBreakdown,
    listExpiredJobs,
    recheckJobUrl
} from "../services/admin/reports.service";

/**
 * Admin-only import analytics endpoints — see §I.5 of the SDD plan for the
 * locked response contract (the dashboard's API client mirrors these shapes
 * verbatim).
 *
 * RBAC: mounted under `/admin/reports/*` with the same admin guard pattern
 * used by `src/routes/admin.ts` — `401` if no token, `403` for non-admin.
 */
export const adminReportsRoutes = new Elysia({ prefix: "/admin/reports" })
    .use(authMiddleware)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return formatError("Unauthorized", 401);
            }
            if (user.role !== "admin") {
                set.status = 403;
                return formatError("Forbidden: Admin access required", 403);
            }
        }
    })
    /**
     * Paginated list of import reports (newest first).
     */
    .get(
        "/import-runs",
        async ({ query, set }) => {
            try {
                const page = query.page ? Number(query.page) : 1;
                const limit = query.limit ? Number(query.limit) : 20;
                const result = await listReports({
                    page,
                    limit,
                    from: query.from,
                    to: query.to
                });
                return formatResponse(result, "Import reports retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to list import reports: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                page: t.Optional(t.Numeric()),
                limit: t.Optional(t.Numeric()),
                from: t.Optional(t.String()),
                to: t.Optional(t.String())
            }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Single report with embedded per-source rows.
     */
    .get(
        "/import-runs/:id",
        async ({ params, set }) => {
            try {
                const result = await getReportWithSources(params.id);
                if (!result) {
                    set.status = 404;
                    return formatError("Import report not found", 404);
                }
                return formatResponse(result, "Import report retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to load import report: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({ id: t.String() }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Per-source leaderboard aggregated from `import_runs`.
     */
    .get(
        "/sources/leaderboard",
        async ({ query, set }) => {
            try {
                const days = query.days ? Number(query.days) : 30;
                const result = await sourceLeaderboard({
                    language: query.language,
                    days
                });
                return formatResponse(result, "Source leaderboard retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to compute leaderboard: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                language: t.Optional(t.String()),
                days: t.Optional(t.Numeric())
            }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Failure-reason aggregate across the window.
     */
    .get(
        "/failures/breakdown",
        async ({ query, set }) => {
            try {
                const result = await failureBreakdown({
                    from: query.from,
                    to: query.to
                });
                return formatResponse(result, "Failure breakdown retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to compute failure breakdown: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                from: t.Optional(t.String()),
                to: t.Optional(t.String())
            }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Paginated list of expired jobs (most recent first).
     */
    .get(
        "/url-health",
        async ({ query, set }) => {
            try {
                const page = query.page ? Number(query.page) : 1;
                const limit = query.limit ? Number(query.limit) : 20;
                const result = await listExpiredJobs({ page, limit });
                return formatResponse(result, "URL health list retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to list expired jobs: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                page: t.Optional(t.Numeric()),
                limit: t.Optional(t.Numeric())
            }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Sync HEAD-probe a single job's URL; flip status when the probe contradicts
     * the persisted state.
     */
    .post(
        "/url-health/:jobId/recheck",
        async ({ params, set }) => {
            try {
                const result = await recheckJobUrl(params.jobId);
                return formatResponse(result, "URL recheck completed");
            } catch (error) {
                const message = getErrorMessage(error);
                if (message.toLowerCase().includes("not found")) {
                    set.status = 404;
                    return formatError("Job not found", 404);
                }
                set.status = 500;
                return formatError(`Failed to recheck URL: ${message}`, 500);
            }
        },
        {
            params: t.Object({ jobId: t.String() }),
            detail: { tags: ["admin"] }
        }
    );
