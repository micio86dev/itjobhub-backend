import { prisma } from "../../config/database";
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
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      password: hashedPassword,
      firstName: input.firstName,
      lastName: input.lastName
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true
    }
  });

  // Generate refresh token
  const payload: UserJwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  const refreshToken = await generateRefreshToken(payload);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  return {
    user: {
      ...user,
      createdAt: user.createdAt.toISOString()
    },
    refreshToken
  };
};

/**
 * Authenticate user login
 * @param input - Login credentials
 * @returns User data and refresh token
 */
export const loginUser = async (input: LoginInput) => {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email }
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
    role: user.role
  };

  const refreshToken = await generateRefreshToken(payload);

  // Store or update refresh token
  // Find existing refresh token for the user
  const existingToken = await prisma.refreshToken.findFirst({
    where: { userId: user.id }
  });

  if (existingToken) {
    await prisma.refreshToken.update({
      where: { token: existingToken.token },
      data: {
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });
  } else {
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });
  }

  return {
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt.toISOString()
    }
  };
};

/**
 * Refresh authentication token
 * @param refreshToken - Refresh token
 * @returns User data and new refresh token
 */
export const refreshAuthToken = async (refreshToken: string) => {
  // Find refresh token in database
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true }
  });

  if (!tokenRecord) {
    throw new Error("Invalid refresh token");
  }

  // Check if token is expired
  if (tokenRecord.expiresAt < new Date()) {
    // Delete expired token
    await prisma.refreshToken.delete({
      where: { token: refreshToken }
    });
    throw new Error("Refresh token expired");
  }

  // Generate new refresh token
  const payload: UserJwtPayload = {
    id: tokenRecord.user.id,
    email: tokenRecord.user.email,
    role: tokenRecord.user.role
  };

  const newRefreshToken = await generateRefreshToken(payload);

  // Update refresh token in database
  await prisma.refreshToken.update({
    where: { token: refreshToken },
    data: {
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  return {
    user: {
      id: tokenRecord.user.id,
      email: tokenRecord.user.email,
      firstName: tokenRecord.user.firstName,
      lastName: tokenRecord.user.lastName,
      role: tokenRecord.user.role,
      createdAt: tokenRecord.user.createdAt.toISOString()
    },
    refreshToken: newRefreshToken
  };
};

/**
 * Logout user by removing refresh token
 * @param refreshToken - Refresh token to invalidate
 */
export const logoutUser = async (refreshToken: string) => {
  try {
    await prisma.refreshToken.delete({
      where: { token: refreshToken }
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
const generateRefreshToken = async (payload: UserJwtPayload): Promise<string> => {
  // Generate a random string with user info for refresh token
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `refresh_${payload.id}_${timestamp}_${random}`;
};