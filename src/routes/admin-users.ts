import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import {
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    upsertUserProfile,
    softDeleteUser
} from "../services/users/user.service";
import { getUserCVs } from "../services/cv/cv.service";
import { hashPassword, generatePassword } from "../utils/password";

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
        availability: string[] | null;
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
     * Create a new account (user or admin) from the dashboard.
     *
     * The admin supplies only email, name and role; the password is generated
     * server-side and returned in plaintext exactly once (`generatedPassword`),
     * to be communicated to the user. The user then changes it and fills in
     * personal data from their own profile.
     */
    .post(
        "/",
        async ({ body, set }) => {
            try {
                const email = body.email.trim().toLowerCase();

                const existing = await getUserByEmail(email);
                if (existing) {
                    set.status = 409;
                    return formatError("A user with this email already exists", 409);
                }

                const generatedPassword = generatePassword();
                const hashed = await hashPassword(generatedPassword);

                const created = await createUser({
                    email,
                    password: hashed,
                    first_name: body.firstName,
                    last_name: body.lastName,
                    role: body.role
                });

                set.status = 201;
                return formatResponse(
                    {
                        id: created.id,
                        email: created.email,
                        firstName: created.first_name,
                        lastName: created.last_name,
                        role: created.role,
                        createdAt: created.created_at?.toISOString() ?? null,
                        generatedPassword
                    },
                    "User created successfully"
                );
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to create user: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            body: t.Object({
                email: t.String({ format: "email" }),
                firstName: t.String({ minLength: 1 }),
                lastName: t.String({ minLength: 1 }),
                role: t.Union([t.Literal("user"), t.Literal("admin")])
            }),
            detail: { tags: ["admin"] }
        }
    )
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
                // Role lives on the User record, not the profile — update it
                // separately when supplied.
                if (body.role) {
                    await updateUser(params.id, { role: body.role });
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
                role: t.Optional(t.Union([t.Literal("user"), t.Literal("admin")])),
                firstName: t.Optional(t.String()),
                lastName: t.Optional(t.String()),
                phone: t.Optional(t.String()),
                location: t.Optional(t.String()),
                bio: t.Optional(t.String()),
                birthDate: t.Optional(t.String()),
                languages: t.Optional(t.Array(t.String())),
                skills: t.Optional(t.Array(t.String())),
                seniority: t.Optional(t.String()),
                availability: t.Optional(t.Array(t.String())),
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
    )
    /**
     * Soft delete a user. The account is flagged with `deleted_at` (preserved
     * in the DB) and excluded from listings, lookups and login. Admins cannot
     * delete their own account to avoid locking themselves out.
     */
    .delete(
        "/:id",
        async ({ params, set, user }) => {
            try {
                if (user?.id === params.id) {
                    set.status = 400;
                    return formatError("You cannot delete your own account", 400);
                }
                const existing = await getUserById(params.id);
                if (!existing) {
                    set.status = 404;
                    return formatError("User not found", 404);
                }
                await softDeleteUser(params.id);
                return formatResponse(null, "User deleted successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to delete user: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({ id: t.String() }),
            detail: { tags: ["admin"] }
        }
    );
