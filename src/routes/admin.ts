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
    });
