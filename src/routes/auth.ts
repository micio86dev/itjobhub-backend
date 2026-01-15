import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import {
  registerUser,
  loginUser,
  refreshAuthToken,
  logoutUser,
} from "../services/auth/auth.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { translate, deriveLang } from "../i18n";
import { UserJwtPayload } from "../utils/jwt";
import { config } from "../config";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .derive(deriveLang)
  /**
   * Register a new user
   * @method POST
   * @path /auth/register
   */
  .use(
    jwt({
      name: "jwt",
      secret: config.jwt.secret,
      exp: config.jwt.expiresIn
    })
  )
  .onError(({ code, error, set, request }) => {
    if (code === 'VALIDATION') {
      const { lang } = deriveLang({ request });
      set.status = 400;
      return {
        success: false,
        status: 400,
        message: translate('validation.error', lang),
        errors: error.all
      };
    }
  })
  .post(
    "/register",
    async (context) => {
      const { body, cookie: { refresh_token }, set, jwt } = context;
      try {
        const result = await registerUser(body);

        // Generate JWT token using Elysia's JWT plugin
        const payload: UserJwtPayload = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        };

        const token = await jwt.sign(payload) as string;
        const refreshToken = result.refreshToken;

        // Set refresh token as HttpOnly cookie
        refresh_token.set({
          value: refreshToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        set.status = 201;
        return formatResponse(
          {
            user: result.user,
            token: token,
          },
          "User registered successfully",
          201
        );
      } catch (error: unknown) {
        set.status = 400;
        return {
          success: false,
          status: 400,
          message: getErrorMessage(error) || "Unknown registration error"
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        firstName: t.String({ minLength: 1 }),
        lastName: t.String({ minLength: 1 }),
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            user: t.Object({
              id: t.String(),
              email: t.String(),
              firstName: t.String(),
              lastName: t.String(),
              role: t.String(),
              createdAt: t.String(),
              profileCompleted: t.Boolean(),
              phone: t.Optional(t.String()),
              location: t.Optional(t.String()),
              bio: t.Optional(t.String()),
              birthDate: t.Optional(t.String()),
              avatar: t.Optional(t.String()),
              languages: t.Optional(t.Array(t.String())),
              skills: t.Optional(t.Array(t.String())),
              seniority: t.Optional(t.String()),
              availability: t.Optional(t.String()),
              location_geo: t.Optional(t.Object({
                type: t.String(),
                coordinates: t.Array(t.Number())
              })),
            }),
            token: t.String(),
          }),
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["auth"],
      },
    }
  )
  /**
   * Login user
   * @method POST
   * @path /auth/login
   */
  .post(
    "/login",
    async (context) => {
      const { body, cookie: { refresh_token }, set, jwt } = context;
      try {
        const result = await loginUser(body);

        // Generate JWT token using Elysia's JWT plugin
        const payload: UserJwtPayload = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        };

        const token = await jwt.sign(payload) as string;
        const refreshToken = result.refreshToken;

        // Set refresh token as HttpOnly cookie
        refresh_token.set({
          value: refreshToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        return formatResponse(
          {
            user: result.user,
            token: token,
          },
          "Login successful"
        );
      } catch {
        set.status = 401;
        return {
          success: false,
          status: 401,
          message: translate('auth.invalid_credentials', context.lang)
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            user: t.Object({
              id: t.String(),
              email: t.String(),
              firstName: t.String(),
              lastName: t.String(),
              role: t.String(),
              createdAt: t.String(),
              profileCompleted: t.Boolean(),
              phone: t.Optional(t.String()),
              location: t.Optional(t.String()),
              bio: t.Optional(t.String()),
              birthDate: t.Optional(t.String()),
              avatar: t.Optional(t.String()),
              languages: t.Optional(t.Array(t.String())),
              skills: t.Optional(t.Array(t.String())),
              seniority: t.Optional(t.String()),
              availability: t.Optional(t.String()),
              location_geo: t.Optional(t.Object({
                type: t.String(),
                coordinates: t.Array(t.Number())
              })),
            }),
            token: t.String(),
          }),
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["auth"],
      },
    }
  )
  /**
   * Refresh authentication token
   * @method POST
   * @path /auth/refresh
   */
  .post(
    "/refresh",
    async (context) => {
      const { cookie: { refresh_token }, set, jwt } = context;
      try {
        const refreshToken = refresh_token.value;
        if (!refreshToken || typeof refreshToken !== 'string') {
          set.status = 401;
          return formatError("Refresh token required", 401);
        }

        const result = await refreshAuthToken(refreshToken);

        // Generate new JWT token using Elysia's JWT plugin
        const payload: UserJwtPayload = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        };

        const token = await jwt.sign(payload) as string;

        // Set new refresh token as HttpOnly cookie
        refresh_token.set({
          value: result.refreshToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        return formatResponse(
          {
            user: result.user,
            token: token,
          },
          "Token refreshed successfully"
        );
      } catch (error: unknown) {
        set.status = 401;
        return {
          success: false,
          status: 401,
          message: getErrorMessage(error)
        };
      }
    },
    {
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            user: t.Object({
              id: t.String(),
              email: t.String(),
              firstName: t.String(),
              lastName: t.String(),
              role: t.String(),
              createdAt: t.String(),
              profileCompleted: t.Boolean(),
              phone: t.Optional(t.String()),
              location: t.Optional(t.String()),
              bio: t.Optional(t.String()),
              birthDate: t.Optional(t.String()),
              avatar: t.Optional(t.String()),
              languages: t.Optional(t.Array(t.String())),
              skills: t.Optional(t.Array(t.String())),
              seniority: t.Optional(t.String()),
              availability: t.Optional(t.String()),
              location_geo: t.Optional(t.Object({
                type: t.String(),
                coordinates: t.Array(t.Number())
              })),
            }),
            token: t.String(),
          }),
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["auth"],
      },
    }
  )
  /**
   * Logout user
   * @method POST
   * @path /auth/logout
   */
  .post(
    "/logout",
    async ({ cookie: { refresh_token }, set }) => {
      try {
        const refreshToken = refresh_token.value;
        if (refreshToken && typeof refreshToken === 'string') {
          await logoutUser(refreshToken);
        }

        // Clear refresh token cookie
        refresh_token.remove();

        return formatResponse(null, "Logged out successfully");
      } catch {
        set.status = 500;
        return {
          success: false,
          status: 500,
          message: "Failed to logout"
        };
      }
    },
    {
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Null(),
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["auth"],
      },
    }
  );
