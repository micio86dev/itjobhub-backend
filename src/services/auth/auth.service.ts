import { dbClient } from "../../config/database";
import { hashPassword, comparePasswords } from "../../utils/password";
import { UserJwtPayload } from "../../utils/jwt";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Register a new user
 * @param input - Registration data
 * @returns User data and refresh token
 */
export const registerUser = async (input: RegisterInput) => {
  // Check if user already exists
  const existingUser = await dbClient.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  const user = await dbClient.user.create({
    data: {
      email: input.email,
      password: hashedPassword,
      first_name: input.firstName,
      last_name: input.lastName,
      role: "user", // Should be lowercase to match schema default
    }
  });

  // Generate refresh token
  const payload: UserJwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const refreshToken = await generateRefreshToken(payload);

  // Store refresh token
  await dbClient.refreshToken.create({
    data: {
      refresh_token: refreshToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at?.toISOString() ?? new Date().toISOString(),
    },
    refreshToken,
  };
};

/**
 * Authenticate user login
 * @param input - Login credentials
 * @returns User data and refresh token
 */
export const loginUser = async (input: LoginInput) => {
  // Find user by email
  const user = await dbClient.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    console.log(`Login failed: user not found for email ${input.email}`);
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await comparePasswords(input.password, user.password);
  console.log(`Password valid: ${isPasswordValid} for email ${input.email}`);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Generate refresh token
  const payload: UserJwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const refreshToken = await generateRefreshToken(payload);

  // Store or update refresh token
  // Find existing refresh token for the user
  const existingTokens = await dbClient.refreshToken.findMany({
    where: { user_id: user.id },
  });

  if (existingTokens.length > 0) {
    await dbClient.refreshToken.update({
      where: { refresh_token: existingTokens[0].refresh_token },
      data: {
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
  } else {
    await dbClient.refreshToken.create({
      data: {
        refresh_token: refreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });
  }

  return {
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at?.toISOString() ?? new Date().toISOString(),
    },
  };
};

/**
 * Refresh authentication token
 * @param refreshToken - Refresh token
 * @returns User data and new refresh token
 */
export const refreshAuthToken = async (refreshToken: string) => {
  // Find refresh token in database
  const tokenRecord = await dbClient.refreshToken.findUnique({
    where: { refresh_token: refreshToken },
  });

  if (!tokenRecord) {
    throw new Error("Invalid refresh token");
  }

  // Get the user data
  const user = await dbClient.user.findUnique({
    where: { id: tokenRecord.user_id },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if token is expired
  if (tokenRecord.expires_at < new Date()) {
    // Delete expired token
    await dbClient.refreshToken.delete({
      where: { refresh_token: refreshToken },
    });
    throw new Error("Refresh token expired");
  }

  // Generate new refresh token
  const payload: UserJwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const newRefreshToken = await generateRefreshToken(payload);

  // Update refresh token in database
  await dbClient.refreshToken.update({
    where: { refresh_token: refreshToken },
    data: {
      refresh_token: newRefreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at?.toISOString() ?? new Date().toISOString(),
    },
    refreshToken: newRefreshToken,
  };
};

/**
 * Logout user by removing refresh token
 * @param refreshToken - Refresh token to invalidate
 */
export const logoutUser = async (refreshToken: string) => {
  try {
    await dbClient.refreshToken.delete({
      where: { refresh_token: refreshToken },
    });
  } catch (error) {
    // Ignore errors if token doesn't exist
    console.warn("Failed to delete refresh token:", error);
  }
};

/**
 * Generate refresh token for user authentication
 * @param payload - User data to include in token
 * @returns Refresh token string
 */
const generateRefreshToken = async (
  payload: UserJwtPayload
): Promise<string> => {
  // Generate a random string with user info for refresh token
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `refresh_${payload.id}_${timestamp}_${random}`;
};
