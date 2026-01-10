import { Elysia } from "elysia";
import { getStatistics } from "../services/admin/admin.service";
import { formatResponse, formatError } from "../utils/response";

export const adminRoutes = new Elysia({ prefix: "/admin" })
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
            const month = query.month ? parseInt(query.month as string) : undefined;
            const year = query.year ? parseInt(query.year as string) : undefined;

            const stats = await getStatistics(month, year);
            return formatResponse(stats, "Statistics retrieved successfully");
        } catch (error) {
            return formatError("Failed to retrieve statistics", 500);
        }
    });
