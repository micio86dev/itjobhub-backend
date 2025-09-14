import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { UserJwtPayload } from "../utils/jwt";
import { config } from "../config";

/**
 * Authentication middleware that verifies JWT tokens
 * and attaches user information to the request context
 */
export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(
    jwt({
      name: "jwt",
      secret: config.jwt.secret,
      exp: config.jwt.expiresIn
    })
  )
  .derive(
    { as: "global" },
    async ({ jwt, headers }) => {
      const authHeader = headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) return { user: null };

      const token = authHeader.slice(7);
      try {
        const payload = await jwt.verify(token);
        return { user: payload ? (payload as unknown as UserJwtPayload) : null };
      } catch {
        return { user: null };
      }
    }
  );
