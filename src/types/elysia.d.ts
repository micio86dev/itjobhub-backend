import type { UserJwtPayload } from "../utils/jwt";

declare module "elysia" {
  interface Context {
    user: UserJwtPayload | null;
  }
}
