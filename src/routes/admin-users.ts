import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import {
    getUserById,
    upsertUserProfile
} from "../services/users/user.service";
import { getUserCVs } from "../services/cv/cv.service";

/**
 * Admin-only user info cards. Lets an admin view and edit a single user's full
 * profile (skills, seniority, CV list, portfolio, etc.) from the dashboard.
 *
 * RBAC: same admin guard as `admin-reports`/`admin-providers` — 401 without a
 * token, 403 for non-admin.
 */

interface UserRecord {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    phone: string | null;
    location: string | null;
    birthDate: string | null;
    bio: string | null;
    avatar: string | null;
    created_at: Date | null;
    profile: {
        languages: string[];
        skills: string[];
        seniority: string | null;
        availability: string | null;
        workModes: string[];
        salaryMin: number | null;
        cv_url: string | null;
        portfolio_url: string | null;
        bio: string | null;
        github: string | null;
        linkedin: string | null;
        website: string | null;
    } | null;
}

const toAdminUser = async (raw: UserRecord) => {
    const p = raw.profile;
    const cvs = await getUserCVs(raw.id);
    return {
        id: raw.id,
        email: raw.email,
        firstName: raw.first_name,
        lastName: raw.last_name,
        role: raw.role,
        phone: raw.phone ?? undefined,
        location: raw.location ?? undefined,
        birthDate: raw.birthDate ?? undefined,
        bio: raw.bio ?? undefined,
        avatar: raw.avatar ?? undefined,
        createdAt: raw.created_at?.toISOString() ?? null,
        profile: p
            ? {
                  languages: p.languages ?? [],
                  skills: p.skills ?? [],
                  seniority: p.seniority ?? undefined,
                  availability: p.availability ?? undefined,
                  workModes: p.workModes ?? [],
                  salaryMin: p.salaryMin ?? undefined,
                  cvUrl: p.cv_url ?? undefined,
                  portfolioUrl: p.portfolio_url ?? undefined,
                  bio: p.bio ?? undefined,
                  github: p.github ?? undefined,
                  linkedin: p.linkedin ?? undefined,
                  website: p.website ?? undefined
              }
            : null,
        cvs
    };
};

export const adminUsersRoutes = new Elysia({ prefix: "/admin/users" })
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
     * Full user info card: user fields + profile + uploaded CVs.
     */
    .get(
        "/:id",
        async ({ params, set }) => {
            try {
                const raw = await getUserById(params.id);
                if (!raw) {
                    set.status = 404;
                    return formatError("User not found", 404);
                }
                const result = await toAdminUser(raw as unknown as UserRecord);
                return formatResponse(result, "User retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to retrieve user: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({ id: t.String() }),
            detail: { tags: ["admin"] }
        }
    )
    /**
     * Update a user's profile/info card (admin edit).
     */
    .put(
        "/:id",
        async ({ params, body, set }) => {
            try {
                const existing = await getUserById(params.id);
                if (!existing) {
                    set.status = 404;
                    return formatError("User not found", 404);
                }
                await upsertUserProfile(params.id, body);
                const updated = await getUserById(params.id);
                const result = await toAdminUser(updated as unknown as UserRecord);
                return formatResponse(result, "User updated successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to update user: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({ id: t.String() }),
            body: t.Object({
                firstName: t.Optional(t.String()),
                lastName: t.Optional(t.String()),
                phone: t.Optional(t.String()),
                location: t.Optional(t.String()),
                bio: t.Optional(t.String()),
                birthDate: t.Optional(t.String()),
                languages: t.Optional(t.Array(t.String())),
                skills: t.Optional(t.Array(t.String())),
                seniority: t.Optional(t.String()),
                availability: t.Optional(t.String()),
                workModes: t.Optional(t.Array(t.String())),
                salaryMin: t.Optional(t.Number()),
                cvUrl: t.Optional(t.String()),
                portfolioUrl: t.Optional(t.String()),
                github: t.Optional(t.String()),
                linkedin: t.Optional(t.String()),
                website: t.Optional(t.String())
            }),
            detail: { tags: ["admin"] }
        }
    );
