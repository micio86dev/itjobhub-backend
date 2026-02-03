import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import {
  registerUser,
  loginUser,
  refreshAuthToken,
  logoutUser,
  forgotPassword,
  resetPassword,
} from "../services/auth/auth.service";
import { getAuthorizationUrl, processOAuthCallback } from "../services/auth/oauth.service";
import { OAuthProvider, isOAuthConfigured } from "../config/oauth.config";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { translate, deriveLang } from "../i18n";
import { UserJwtPayload } from "../utils/jwt";
import { config } from "../config";
import logger from "../utils/logger";

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
      } catch (error) {
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
      } catch (error) {
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
  )
  /**
   * Request password reset
   * @method POST
   * @path /auth/forgot-password
   */
  .post(
    "/forgot-password",
    async ({ body, set }) => {
      try {
        await forgotPassword(body.email);
        return formatResponse(
          null,
          "If an account exists with this email, a password reset link has been sent."
        );
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          status: 500,
          message: getErrorMessage(error) || "Failed to process request"
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
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
  )
  /**
   * Reset password
   * @method POST
   * @path /auth/reset-password
   */
  .post(
    "/reset-password",
    async ({ body, set }) => {
      try {
        await resetPassword(body.token, body.password);
        return formatResponse(null, "Password reset successfully");
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          status: 400,
          message: getErrorMessage(error) || "Failed to reset password"
        };
      }
    },
    {
      body: t.Object({
        token: t.String(),
        password: t.String({ minLength: 6 }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Null(),
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
   * Initiate OAuth flow - redirects to provider
   * @method GET
   * @path /auth/oauth/:provider
   */
  .get(
    "/oauth/:provider",
    async ({ params, set, redirect }) => {
      const provider = params.provider as OAuthProvider;

      // Validate provider
      if (!['github', 'linkedin', 'google'].includes(provider)) {
        set.status = 400;
        return formatError(`Invalid OAuth provider: ${provider}`, 400);
      }

      // Check if OAuth is configured
      if (!isOAuthConfigured(provider)) {
        set.status = 503;
        return formatError(`OAuth not configured for ${provider}`, 503);
      }

      // Generate state for CSRF protection
      const state = Math.random().toString(36).substring(2);

      // Get authorization URL
      const authUrl = getAuthorizationUrl(provider, state);

      logger.info({ provider }, 'Initiating OAuth flow');

      // Redirect to provider
      return redirect(authUrl, 302);
    },
    {
      params: t.Object({
        provider: t.String(),
      }),
      detail: {
        tags: ["auth"],
        description: "Initiate OAuth flow with a provider (github, linkedin, google)",
      },
    }
  )
  /**
   * Handle OAuth callback from provider
   * @method POST
   * @path /auth/oauth/:provider/callback
   */
  .post(
    "/oauth/:provider/callback",
    async (context) => {
      const { params, body, cookie: { refresh_token }, set, jwt } = context;
      const provider = params.provider as OAuthProvider;
      const { code } = body;

      // Validate provider
      if (!['github', 'linkedin', 'google'].includes(provider)) {
        set.status = 400;
        return formatError(`Invalid OAuth provider: ${provider}`, 400);
      }

      if (!code) {
        set.status = 400;
        return formatError('Authorization code is required', 400);
      }

      try {
        // Process OAuth callback
        const user = await processOAuthCallback(provider, code);

        if (!user) {
          set.status = 401;
          return formatError('Failed to authenticate with OAuth provider', 401);
        }

        // Check if profile is complete
        const profileComplete = user.profile &&
          Array.isArray(user.profile.languages) && user.profile.languages.length > 0 &&
          Array.isArray(user.profile.skills) && user.profile.skills.length > 0 &&
          !!user.profile.seniority &&
          !!user.profile.availability;

        // Generate JWT token
        const payload: UserJwtPayload = {
          id: user.id,
          email: user.email,
          role: user.role,
        };

        const token = await jwt.sign(payload) as string;

        // Generate refresh token
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        const refreshToken = `refresh_${user.id}_${timestamp}_${random}`;

        // Store refresh token
        const { dbClient } = await import('../config/database');
        await dbClient.refreshToken.create({
          data: {
            refresh_token: refreshToken,
            user_id: user.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          }
        });

        // Set refresh token as HttpOnly cookie
        refresh_token.set({
          value: refreshToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        logger.info({ userId: user.id, provider }, 'OAuth login successful');

        return formatResponse(
          {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
              role: user.role,
              createdAt: user.created_at?.toISOString() ?? new Date().toISOString(),
              profileCompleted: profileComplete,
              phone: user.phone || undefined,
              location: user.location || undefined,
              bio: user.bio || undefined,
              birthDate: user.birthDate || undefined,
              avatar: user.avatar || undefined,
              languages: user.profile?.languages || [],
              skills: user.profile?.skills || [],
              seniority: user.profile?.seniority || undefined,
              availability: user.profile?.availability || undefined,
            },
            token,
          },
          "OAuth login successful"
        );
      } catch (error) {
        logger.error({ error, provider }, 'OAuth callback failed');
        set.status = 401;
        return {
          success: false,
          status: 401,
          message: getErrorMessage(error) || 'OAuth authentication failed',
        };
      }
    },
    {
      params: t.Object({
        provider: t.String(),
      }),
      body: t.Object({
        code: t.String(),
        state: t.Optional(t.String()),
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
            }),
            token: t.String(),
          }),
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["auth"],
        description: "Handle OAuth callback with authorization code",
      },
    }
  );
