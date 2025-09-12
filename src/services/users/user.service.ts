import { prisma } from "../../config/database";

export interface ProfileUpdateInput {
  languages?: string[];
  skills?: string[];
  seniority?: string;
  availability?: string;
  bio?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  cvUrl?: string;
}

/**
 * Get user profile by user ID
 * @param userId - User ID
 * @returns User profile data
 */
export const getUserProfile = async (userId: string) => {
  return await prisma.profile.findUnique({
    where: { userId }
  });
};

/**
 * Create or update user profile
 * @param userId - User ID
 * @param data - Profile data
 * @returns Updated profile
 */
export const upsertUserProfile = async (userId: string, data: ProfileUpdateInput) => {
  // Check if profile exists
  const existingProfile = await prisma.profile.findUnique({
    where: { userId }
  });

  if (existingProfile) {
    // Update existing profile
    return await prisma.profile.update({
      where: { userId },
      data
    });
  } else {
    // Create new profile
    return await prisma.profile.create({
      data: {
        userId,
        ...data
      }
    });
  }
};

/**
 * Get user by ID
 * @param userId - User ID
 * @returns User data
 */
export const getUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
      profile: true
    }
  });
  
  if (!user) {
    return null;
  }
  
  // Convert Date objects to ISO strings and handle profile properly
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    profile: user.profile ? {
      ...user.profile,
      createdAt: user.profile.createdAt.toISOString(),
      updatedAt: user.profile.updatedAt.toISOString()
    } : undefined
  };
};