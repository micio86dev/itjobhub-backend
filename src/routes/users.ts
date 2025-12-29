import { Elysia, t } from "elysia";
import { getUserById, getUserProfile, upsertUserProfile } from "../services/users/user.service";
import { authMiddleware } from "../middleware/auth";
import { formatResponse, formatError } from "../utils/response";

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

        return formatResponse(userData, "User data retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve user data", 500);
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
            createdAt: t.String(),
            profile: t.Optional(t.Object({
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

        return formatResponse(profile, "Profile retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve profile", 500);
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

        return formatResponse(profile, "Profile updated successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to update profile", 500);
      }
    },
    {
      body: t.Object({
        languages: t.Optional(t.Array(t.String())),
        skills: t.Optional(t.Array(t.String())),
        seniority: t.Optional(t.String()),
        availability: t.Optional(t.String()),
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