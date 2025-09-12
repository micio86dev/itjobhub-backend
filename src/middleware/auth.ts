import { Elysia } from "elysia";
import { UserJwtPayload } from "../utils/jwt";

declare module "elysia" {
  interface Context {
    user: UserJwtPayload | null;
  }
}

/**
 * Authentication middleware that verifies JWT tokens
 * and attaches user information to the request context
 */
export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .derive({ as: "global" }, async ({ jwt, headers, set }) => {
    // Get token from Authorization header
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        user: null
      };
    }
    
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    if (!token) {
      return {
        user: null
      };
    }
    
    try {
      // Verify token using Elysia's JWT plugin
      const payload = await jwt.verify(token);
      
      if (!payload) {
        return {
          user: null
        };
      }
      
      return {
        user: payload as UserJwtPayload
      };
    } catch (error) {
      return {
        user: null
      };
    }
  });