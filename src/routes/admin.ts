import { Elysia } from "elysia";
import { getStatistics } from "../services/admin/admin.service";
import { formatResponse, formatError } from "../utils/response";

import { authMiddleware } from "../middleware/auth";
import { t } from "elysia";

export const adminRoutes = new Elysia({ prefix: "/admin" })
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
    .get("/stats", async ({ query }) => {
        try {
            const stats = await getStatistics(query.month, query.year);
            return formatResponse(stats, "Statistics retrieved successfully");
        } catch {
            return formatError("Failed to retrieve statistics", 500);
        }
    }, {
        query: t.Object({
            month: t.Optional(t.Numeric()),
            year: t.Optional(t.Numeric())
        })
    })
    .get("/stats/registrations-timeline", async ({ query }) => {
        try {
            const days = parseInt(query.days || "30");
            const { getRegistrationsTimeline } = await import("../services/admin/admin.service");
            const data = await getRegistrationsTimeline(days);
            return formatResponse(data, "Registrations timeline retrieved successfully");
        } catch {
            return formatError("Failed to retrieve registrations timeline", 500);
        }
    }, {
        query: t.Object({ days: t.Optional(t.String()) })
    })
    .get("/stats/jobs-timeline", async ({ query }) => {
        try {
            const weeks = parseInt(query.weeks || "8");
            const { getJobsTimeline } = await import("../services/admin/admin.service");
            const data = await getJobsTimeline(weeks);
            return formatResponse(data, "Jobs timeline retrieved successfully");
        } catch {
            return formatError("Failed to retrieve jobs timeline", 500);
        }
    }, {
        query: t.Object({ weeks: t.Optional(t.String()) })
    })
    .get("/stats/login-methods", async () => {
        try {
            const { getLoginMethodsDistribution } = await import("../services/admin/admin.service");
            const data = await getLoginMethodsDistribution();
            return formatResponse(data, "Login methods retrieved successfully");
        } catch {
            return formatError("Failed to retrieve login methods distribution", 500);
        }
    })
    .get("/stats/top-languages", async ({ query }) => {
        try {
            const limit = parseInt(query.limit || "10");
            const { getTopLanguages } = await import("../services/admin/admin.service");
            const data = await getTopLanguages(limit);
            return formatResponse(data, "Top languages retrieved successfully");
        } catch {
            return formatError("Failed to retrieve top languages", 500);
        }
    }, {
        query: t.Object({ limit: t.Optional(t.String()) })
    });
