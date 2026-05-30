import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import {
    listProviders,
    setProviderEnabled,
} from "../services/admin/providers.service";

/**
 * Admin-only provider catalog config. Lists every import source with its
 * pricing tier / auth requirements and toggles the `enabled` flag consumed by
 * the scraper's `is_provider_enabled()` gate.
 *
 * RBAC: same admin guard as `src/routes/admin-reports.ts` — 401 without a
 * token, 403 for non-admin.
 */
export const adminProvidersRoutes = new Elysia({ prefix: "/admin/providers" })
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
     * Full provider catalog (ordered free → freemium → metered).
     */
    .get(
        "/",
        async ({ set }) => {
            try {
                const result = await listProviders();
                return formatResponse(result, "Providers retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to list providers: ${getErrorMessage(error)}`, 500);
            }
        },
        { detail: { tags: ["admin"] } }
    )
    /**
     * Enable/disable a single provider by slug.
     */
    .patch(
        "/:slug",
        async ({ params, body, set }) => {
            try {
                const result = await setProviderEnabled(params.slug, body.enabled);
                if (!result) {
                    set.status = 404;
                    return formatError("Provider not found", 404);
                }
                return formatResponse(result, "Provider updated successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to update provider: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({ slug: t.String() }),
            body: t.Object({ enabled: t.Boolean() }),
            detail: { tags: ["admin"] }
        }
    );
