import { Elysia, t } from "elysia";
import { getUserById, getUserProfile, upsertUserProfile, addUserSkill, getUsers } from "../services/users/user.service";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";

export const userRoutes = new Elysia({ prefix: "/users" })
  .use(authMiddleware)
  /**
   * Get all users (Admin only)
   * @method GET
   * @path /users
   */
  .get(
    "/",
    async ({ query, user, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        if (user.role !== "admin") {
          set.status = 403;
          return formatError("Forbidden: Admin access required", 403);
        }

        const page = parseInt(query.page || "1");
        const limit = parseInt(query.limit || "50");
        const filters = {
          q: query.q,
          role: query.role
        };

        const result = await getUsers(page, limit, filters);

        // Formattiamo gli utenti per rimuovere eventuali dati sensibili ma mantenere le info base del profilo
        const safeResult = {
          ...result,
          users: result.users.map(u => ({
            id: u.id,
            email: u.email,
            firstName: u.first_name,
            lastName: u.last_name,
            role: u.role,
            phone: u.phone,
            location: u.location,
            createdAt: u.created_at,
            profileCompleted: !!u.profile && (u.profile.skills?.length > 0) && !!u.profile.seniority
          }))
        };

        return formatResponse(safeResult, "Users retrieved successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to retrieve users: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        q: t.Optional(t.String()),
        role: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            users: t.Array(t.Object({
              id: t.String(),
              email: t.String(),
              firstName: t.Optional(t.Union([t.String(), t.Null()])),
              lastName: t.Optional(t.Union([t.String(), t.Null()])),
              role: t.String(),
              phone: t.Optional(t.Union([t.String(), t.Null()])),
              location: t.Optional(t.Union([t.String(), t.Null()])),
              createdAt: t.Any(),
              profileCompleted: t.Boolean()
            })),
            pagination: t.Object({
              page: t.Number(),
              limit: t.Number(),
              total: t.Number(),
              pages: t.Number()
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["users"]
      }
    }
  )
  /**
   * Get current user profile
   * @method GET
   * @path /users/me
   */
  .get(
    "/me",
    async ({ user, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const userData = await getUserById(user.id);
        if (!userData) {
          set.status = 404;
          return formatError("User not found", 404);
        }

        const isProfileCompleted = !!userData.profile &&
          (userData.profile.languages?.length > 0 || false) &&
          (userData.profile.skills?.length > 0 || false) &&
          !!userData.profile.seniority &&
          !!userData.profile.availability;

        const formattedUser = {
          id: userData.id,
          email: userData.email,
          firstName: userData.first_name,
          lastName: userData.last_name,
          role: userData.role,
          phone: userData.phone || undefined,
          location: userData.location || undefined,
          location_geo: userData.profile?.location_geo || undefined,
          birthDate: userData.birthDate || undefined,
          bio: userData.bio || undefined,
          avatar: userData.avatar || undefined,
          salaryMin: userData.profile?.salaryMin || 0,
          profileCompleted: isProfileCompleted,
          createdAt: userData.created_at?.toISOString() || new Date().toISOString(),
          profile: userData.profile ? {
            id: userData.profile.id,
            userId: userData.profile.user_id,
            languages: userData.profile.languages,
            skills: userData.profile.skills,
            seniority: userData.profile.seniority || undefined,
            availability: userData.profile.availability || undefined,
            workModes: userData.profile.workModes || [],
            salaryMin: userData.profile.salaryMin || 0,
            cvUrl: userData.profile.cv_url || undefined,
            bio: userData.profile.bio || undefined,
            github: userData.profile.github || undefined,
            linkedin: userData.profile.linkedin || undefined,
            website: userData.profile.website || undefined,
            createdAt: userData.profile.created_at?.toISOString() || new Date().toISOString(),
            updatedAt: userData.profile.updated_at?.toISOString() || new Date().toISOString()
          } : undefined
        };

        return formatResponse(formattedUser, "User data retrieved successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to retrieve user data: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            email: t.String(),
            firstName: t.String(),
            lastName: t.String(),
            role: t.String(),
            profileCompleted: t.Boolean(),
            phone: t.Optional(t.String()),
            location: t.Optional(t.String()),
            location_geo: t.Optional(t.Object({
              type: t.String(),
              coordinates: t.Array(t.Number())
            })),
            birthDate: t.Optional(t.String()),
            salaryMin: t.Optional(t.Number()),
            bio: t.Optional(t.String()),
            avatar: t.Optional(t.String()),
            createdAt: t.String(),
            profile: t.Optional(t.Object({
              id: t.String(),
              userId: t.String(),
              languages: t.Array(t.String()),
              skills: t.Array(t.String()),
              seniority: t.Optional(t.String()),
              availability: t.Optional(t.String()),
              workModes: t.Array(t.String()),
              cvUrl: t.Optional(t.String()),
              bio: t.Optional(t.String()),
              github: t.Optional(t.String()),
              linkedin: t.Optional(t.String()),
              website: t.Optional(t.String()),
              createdAt: t.String(),
              updatedAt: t.String()
            }))
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        404: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["users"]
      }
    }
  )
  /**
   * Get user profile by ID
   * @method GET
   * @path /users/:id/profile
   */
  .get(
    "/:id/profile",
    async ({ params, set }) => {
      try {
        const profile = await getUserProfile(params.id);

        if (!profile) {
          set.status = 404;
          return formatError("Profile not found", 404);
        }

        const formattedProfile = {
          id: profile.id,
          userId: profile.user_id,
          languages: profile.languages,
          skills: profile.skills,
          seniority: profile.seniority || undefined,
          availability: profile.availability || undefined,
          cvUrl: profile.cv_url || undefined,
          bio: profile.bio || undefined,
          github: profile.github || undefined,
          linkedin: profile.linkedin || undefined,
          website: profile.website || undefined,
          workModes: profile.workModes || [],
          createdAt: profile.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: profile.updated_at?.toISOString() || new Date().toISOString()
        };

        return formatResponse(formattedProfile, "Profile retrieved successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to retrieve profile: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            userId: t.String(),
            languages: t.Array(t.String()),
            skills: t.Array(t.String()),
            seniority: t.Optional(t.String()),
            availability: t.Optional(t.String()),
            cvUrl: t.Optional(t.String()),
            bio: t.Optional(t.String()),
            github: t.Optional(t.String()),
            linkedin: t.Optional(t.String()),
            website: t.Optional(t.String()),
            workModes: t.Array(t.String()),
            createdAt: t.String(),
            updatedAt: t.String()
          })
        }),
        404: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["users"]
      }
    }
  )
  /**
   * Update user profile
   * @method PUT
   * @path /users/me/profile
   */
  .put(
    "/me/profile",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const profile = await upsertUserProfile(user.id, body);

        const formattedProfile = {
          id: profile.id,
          userId: profile.user_id,
          languages: profile.languages,
          skills: profile.skills,
          seniority: profile.seniority || undefined,
          availability: profile.availability || undefined,
          workModes: profile.workModes || [],
          salaryMin: profile.salaryMin || 0,
          cvUrl: profile.cv_url || undefined,
          bio: profile.bio || undefined,
          github: profile.github || undefined,
          linkedin: profile.linkedin || undefined,
          website: profile.website || undefined,
          createdAt: profile.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: profile.updated_at?.toISOString() || new Date().toISOString()
        };

        return formatResponse(formattedProfile, "Profile updated successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to update profile: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      body: t.Object({
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        name: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        birthDate: t.Optional(t.String()),
        salaryMin: t.Optional(t.Number()),
        avatar: t.Optional(t.String()),
        languages: t.Optional(t.Array(t.String())),
        skills: t.Optional(t.Array(t.String())),
        seniority: t.Optional(t.String()),
        availability: t.Optional(t.String()),
        workModes: t.Optional(t.Array(t.String())),
        bio: t.Optional(t.String()),
        github: t.Optional(t.String()),
        linkedin: t.Optional(t.String()),
        website: t.Optional(t.String()),
        cvUrl: t.Optional(t.String()),
        location: t.Optional(t.String()),
        locationGeo: t.Optional(t.Object({
          lat: t.Number(),
          lng: t.Number()
        }))
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            userId: t.String(),
            languages: t.Array(t.String()),
            skills: t.Array(t.String()),
            seniority: t.Optional(t.String()),
            availability: t.Optional(t.String()),
            cvUrl: t.Optional(t.String()),
            bio: t.Optional(t.String()),
            github: t.Optional(t.String()),
            linkedin: t.Optional(t.String()),
            website: t.Optional(t.String()),
            workModes: t.Array(t.String()),
            salaryMin: t.Optional(t.Number()),
            createdAt: t.String(),
            updatedAt: t.String()
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["users"]
      }
    }
  )
  /**
   * Add skill to user profile
   * @method POST
   * @path /users/me/skills
   */
  .post(
    "/me/skills",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const profile = await addUserSkill(user.id, body.skill);

        const formattedProfile = {
          id: profile.id,
          userId: profile.user_id,
          languages: profile.languages,
          skills: profile.skills,
          seniority: profile.seniority || undefined,
          availability: profile.availability || undefined,
          workModes: profile.workModes || [],
          cvUrl: profile.cv_url || undefined,
          bio: profile.bio || undefined,
          github: profile.github || undefined,
          linkedin: profile.linkedin || undefined,
          website: profile.website || undefined,
          createdAt: profile.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: profile.updated_at?.toISOString() || new Date().toISOString()
        };

        return formatResponse(formattedProfile, "Skill added successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to add skill: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      body: t.Object({
        skill: t.String({ minLength: 1 })
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            userId: t.String(),
            languages: t.Array(t.String()),
            skills: t.Array(t.String()),
            seniority: t.Optional(t.String()),
            availability: t.Optional(t.String()),
            cvUrl: t.Optional(t.String()),
            bio: t.Optional(t.String()),
            github: t.Optional(t.String()),
            linkedin: t.Optional(t.String()),
            website: t.Optional(t.String()),
            workModes: t.Array(t.String()),
            createdAt: t.String(),
            updatedAt: t.String()
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["users"]
      }
    }
  );