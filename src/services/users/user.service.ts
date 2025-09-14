import { dbClient } from "../../config/database";
import { types } from "../../db";

export interface UserUpdateInput {
  email?: string;
  name?: string;
  role?: 'admin' | 'user';
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
 * Get user by ID
 * @param userId - User ID
 * @returns User data
 */
export const getUserById = async (userId: string) => {
  const userUuid = types.Uuid.fromString(userId);

  const user = await prismausers.findUnique({
    id: userUuid
  });

  if (!user) {
    return null;
  }

  return user;
};

/**
 * Get user by email
 * @param email - User email
 * @returns User data
 */
export const getUserByEmail = async (email: string) => {
  const users = await prismausers.findMany({
    where: { email },
    limit: 1,
    allowFiltering: true
  });

  return users.length > 0 ? users[0] : null;
};

/**
 * Create new user
 * @param data - User data
 * @returns Created user
 */
export const createUser = async (data: {
  email: string;
  password: string;
  name: string;
  role?: 'admin' | 'user';
}) => {
  return await prismausers.create({
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role || 'user'
  });
};

/**
 * Update user
 * @param userId - User ID
 * @param data - Update data
 * @returns Updated user
 */
export const updateUser = async (userId: string, data: UserUpdateInput) => {
  const userUuid = types.Uuid.fromString(userId);

  return await prismausers.update({
    where: { id: userUuid },
    data
  });
};

/**
 * Delete user
 * @param userId - User ID
 */
export const deleteUser = async (userId: string) => {
  const userUuid = types.Uuid.fromString(userId);

  await prismausers.delete({
    where: { id: userUuid }
  });
};

/**
 * Get all users with pagination
 * @param limit - Number of users to return
 * @returns List of users
 */
export const getUsers = async (limit = 50) => {
  return await prismausers.findMany({
    limit
  });
};

/**
 * Get user profile by user ID
 * @param userId - User ID
 * @returns User profile data
 */
export const getUserProfile = async (userId: string) => {
  const userUuid = types.Uuid.fromString(userId);

  const profiles = await prismauser_profiles.findMany({
    where: { user_id: userUuid },
    limit: 1,
    allowFiltering: true
  });

  return profiles.length > 0 ? profiles[0] : null;
};

/**
 * Create or update user profile (upsert)
 * @param userId - User ID
 * @param data - Profile data
 * @returns Created/updated profile
 */
export const upsertUserProfile = async (userId: string, data: UserProfileInput) => {
  const userUuid = types.Uuid.fromString(userId);

  // Check if profile exists
  const existingProfile = await getUserProfile(userId);

  if (existingProfile) {
    // Update existing profile
    return await prismauser_profiles.update({
      where: { id: existingProfile.id },
      data: {
        ...data,
        cv_url: data.cvUrl, // Map camelCase to snake_case
        updated_at: new Date()
      }
    });
  } else {
    // Create new profile
    return await prismauser_profiles.create({
      user_id: userUuid,
      languages: data.languages || [],
      skills: data.skills || [],
      seniority: data.seniority,
      availability: data.availability,
      bio: data.bio,
      github: data.github,
      linkedin: data.linkedin,
      website: data.website,
      cv_url: data.cvUrl
    });
  }
};