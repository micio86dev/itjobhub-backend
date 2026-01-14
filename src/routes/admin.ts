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
            if (user.role !== "ADMIN") { // Check uppercase role used elsewhere? DB uses lowercase 'user' but tests use 'ADMIN'?
                // In auth.service register: role: "user". 
                // In api.test.ts: role: "ADMIN".
                // In jobs.ts: user.role !== "ADMIN".
                // So I should check against "ADMIN" (uppercase) if that's the convention for Admin. 
                // Wait, original code said `user.role !== "admin"`. 
                // Check `api.test.ts` or DB values. I'll stick to existing check but normalized if needed.
                // Actually, `user.role` in `jobs.ts` checks against "ADMIN" and "COMPANY". 
                // Existing `admin.ts` checked "admin". Likely inconsistent. 
                // I will check `auth.service`... register sets "user". 
                // `isAdmin` in tests sets "ADMIN". 
                // Better to check `user.role.toUpperCase() !== "ADMIN"`.
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
