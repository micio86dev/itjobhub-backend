import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { UserJwtPayload } from "../utils/jwt";
import { config } from "../config";

import { prisma } from "../config/database";

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
        if (!payload) return { user: null };

        const userPayload = payload as UserJwtPayload;

        // Verify user exists in database to prevent inconsistencies (e.g., deleted users with valid tokens)
        const user = await prisma.user.findUnique({
          where: { id: userPayload.id },
          select: { id: true, email: true, role: true }
        });

        if (!user) return { user: null };

        return { user: userPayload };
      } catch {
        return { user: null };
      }
    }
  );
