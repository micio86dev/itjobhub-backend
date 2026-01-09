// export interface UserJwtPayload extends Partial<JWTPayloadSpec> { // Removed extends to avoid conflict with iat/aud types
export interface UserJwtPayload {
  id: string;
  email: string;
  role: string;
  [key: string]: string | number | boolean | null | undefined | string[];
}

/**
 * Generate JWT token for user authentication
 * In Elysia, the actual signing is handled by the jwt plugin
 * This function just prepares the payload
 * @param payload - User data to include in token
 * @returns The same payload (signing happens in Elysia's jwt plugin)
 */
export const generateToken = async (payload: UserJwtPayload): Promise<UserJwtPayload> => {
  // In Elysia, we don't manually sign tokens
  // The jwt plugin handles signing when we call jwt.sign()
  // This function is just a placeholder that returns the payload
  return payload;
};

/**
 * Generate refresh token for user authentication
 * @param payload - User data to include in token
 * @returns Refresh token string
 */
export const generateRefreshToken = async (
  payload: UserJwtPayload
): Promise<string> => {
  // Generate a random string with user info for refresh token
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `refresh_${payload.id}_${timestamp}_${random}`;
};
