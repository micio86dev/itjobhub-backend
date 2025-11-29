import { dbClient } from "../../config/database";

export interface UserUpdateInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface UserProfileInput {
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
 * Get user by ID with profile
 * @param userId - User ID
 * @returns User data with profile
 */
export const getUserById = async (userId: string) => {
  const user = await dbClient.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return null;
  }

  // Get user profile
  const profile = await dbClient.userProfile.findUnique({
    where: { user_id: userId }
  });

  // const profile = profiles.length > 0 ? profiles[0] : null; // Removed

  return {
    ...user,
    profile
  };
};

/**
 * Get user by email
 * @param email - User email
 * @returns User data
 */
export const getUserByEmail = async (email: string) => {
  return await dbClient.user.findUnique({
    where: { email }
  });
};

/**
 * Create new user
 * @param data - User data
 * @returns Created user
 */
export const createUser = async (data: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
}) => {
  return await dbClient.user.create({
    data: {
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role || 'user'
    }
  });
};

/**
 * Update user
 * @param userId - User ID
 * @param data - Update data
 * @returns Updated user
 */
export const updateUser = async (userId: string, data: UserUpdateInput) => {
  return await dbClient.user.update({
    where: { id: userId },
    data
  });
};

/**
 * Delete user
 * @param userId - User ID
 */
export const deleteUser = async (userId: string) => {
  await dbClient.user.delete({
    where: { id: userId }
  });
};

/**
 * Get all users with pagination
 * @param limit - Number of users to return
 * @returns List of users
 */
export const getUsers = async (limit = 50) => {
  return await dbClient.user.findMany({
    take: limit
  });
};

/**
 * Get user profile by user ID
 * @param userId - User ID
 * @returns User profile data
 */
export const getUserProfile = async (userId: string) => {
  const profile = await dbClient.userProfile.findUnique({
    where: { user_id: userId }
  });
  return profile;
};

/**
 * Create or update user profile (upsert)
 * @param userId - User ID
 * @param data - Profile data
 * @returns Created/updated profile
 */
export const upsertUserProfile = async (userId: string, data: UserProfileInput) => {
  // Check if profile exists
  const existingProfile = await getUserProfile(userId);

  if (existingProfile) {
    // Update existing profile
    return await dbClient.userProfile.update({
      where: { id: existingProfile.id },
      data: {
        ...data,
        cv_url: data.cvUrl, // Map camelCase to snake_case
        // updated_at: new Date() // Prisma handles this automatically
      }
    });
  } else {
    // Create new profile
    return await dbClient.userProfile.create({
      data: {
        user_id: userId,
        languages: data.languages || [],
        skills: data.skills || [],
        seniority: data.seniority,
        availability: data.availability,
        bio: data.bio,
        github: data.github,
        linkedin: data.linkedin,
        website: data.website,
        cv_url: data.cvUrl
      }
    });
  }
};