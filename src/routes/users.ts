import { Elysia, t } from "elysia";
import { getUserById, getUserProfile, upsertUserProfile, addUserSkill } from "../services/users/user.service";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";

export const userRoutes = new Elysia({ prefix: "/users" })
  .use(authMiddleware)
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
          birthDate: userData.birthDate || undefined,
          bio: userData.bio || undefined,
          avatar: userData.avatar || undefined,
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
      } catch (error: unknown) {
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
            birthDate: t.Optional(t.String()),
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
      } catch (error: unknown) {
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
          cvUrl: profile.cv_url || undefined,
          bio: profile.bio || undefined,
          github: profile.github || undefined,
          linkedin: profile.linkedin || undefined,
          website: profile.website || undefined,
          createdAt: profile.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: profile.updated_at?.toISOString() || new Date().toISOString()
        };

        return formatResponse(formattedProfile, "Profile updated successfully");
      } catch (error: unknown) {
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
      } catch (error: unknown) {
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