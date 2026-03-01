import { dbClient } from "../../config/database";
import type { Prisma } from "@prisma/client";

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
  workModes?: string[];
  salaryMin?: number;
  bio?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  cvUrl?: string;
  location?: string;
  locationGeo?: {
    lat: number;
    lng: number;
  };
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
 * Get all users with pagination and filters
 * @param page - Page number
 * @param limit - Number of users per page
 * @param filters - Optional filters
 * @returns Paginated list of users
 */
export const getUsers = async (
  page = 1,
  limit = 50,
  filters?: {
    q?: string;
    role?: string;
  }
) => {
  const skip = (page - 1) * limit;
  const where: Prisma.UserWhereInput = {};

  if (filters?.role) {
    where.role = filters.role;
  }

  if (filters?.q) {
    where.OR = [
      { first_name: { contains: filters.q, mode: "insensitive" } },
      { last_name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } }
    ];
  }

  const [users, total] = await Promise.all([
    dbClient.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: { profile: true }
    }),
    dbClient.user.count({ where })
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
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

export const upsertUserProfile = async (userId: string, data: UserProfileInput & { name?: string; firstName?: string; lastName?: string; phone?: string; birthDate?: string; avatar?: string }) => {
  // Check if profile exists
  const existingProfile = await getUserProfile(userId);

  // Update User model fields if provided
  // Update User model fields if provided
  if (
    data.name !== undefined ||
    data.firstName !== undefined ||
    data.lastName !== undefined ||
    data.phone !== undefined ||
    data.birthDate !== undefined ||
    data.avatar !== undefined ||
    data.location !== undefined ||
    data.bio !== undefined
  ) {
    let firstName = data.firstName;
    let lastName = data.lastName;

    // Fallback to splitting name if firstName/lastName not provided but name is
    if (firstName === undefined && lastName === undefined && data.name) {
      const nameParts = data.name.split(" ");
      firstName = nameParts.length > 0 ? nameParts[0] : undefined;
      lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;
    }

    await dbClient.user.update({
      where: { id: userId },
      data: {
        ...(firstName !== undefined && { first_name: firstName }),
        ...(lastName !== undefined && { last_name: lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.birthDate !== undefined && { birthDate: data.birthDate }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.bio !== undefined && { bio: data.bio }),
      },
    });
  }

  // Build update data with proper field mapping (camelCase to snake_case)
  interface UserProfileUpdateData {
    languages?: string[];
    skills?: string[];
    seniority?: string;
    availability?: string;
    workModes?: string[];
    salaryMin?: number;
    bio?: string;
    github?: string;
    linkedin?: string;
    website?: string;
    location?: string;
    cv_url?: string;
    location_geo?: {
      type: 'Point';
      coordinates: [number, number];
    };
  }

  const updateData: UserProfileUpdateData = {
    languages: data.languages,
    skills: data.skills,
    seniority: data.seniority,
    availability: data.availability,
    workModes: data.workModes,
    salaryMin: data.salaryMin,
    bio: data.bio,
    github: data.github,
    linkedin: data.linkedin,
    website: data.website,
    location: data.location,
    cv_url: data.cvUrl
  };

  // Map locationGeo to location_geo
  if (data.locationGeo) {
    updateData.location_geo = {
      type: "Point",
      coordinates: [data.locationGeo.lng, data.locationGeo.lat],
    };
  } else if (data.location === "" || data.location === null) {
    // Clear coordinates if location is cleared
    updateData.location_geo = null as unknown as UserProfileUpdateData['location_geo'];
  }

  if (existingProfile) {
    // Update existing profile
    return await dbClient.userProfile.update({
      where: { id: existingProfile.id },
      data: updateData,
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
        workModes: data.workModes || [],
        salaryMin: data.salaryMin,
        bio: data.bio,
        github: data.github,
        linkedin: data.linkedin,
        website: data.website,
        cv_url: data.cvUrl,
        location: data.location,
        location_geo:
          data.locationGeo && data.locationGeo.lng && data.locationGeo.lat
            ? {
              type: "Point",
              coordinates: [data.locationGeo.lng, data.locationGeo.lat],
            }
            : undefined,
      },
    });
  }
};

/**
 * Add a skill to user profile
 * @param userId - User ID
 * @param skill - Skill to add
 * @returns Updated user profile
 */
export const addUserSkill = async (userId: string, skill: string) => {
  // Ensure profile exists first
  const profile = await getUserProfile(userId);

  if (!profile) {
    // Create profile with initial skill if it doesn't exist
    return await dbClient.userProfile.create({
      data: {
        user_id: userId,
        skills: [skill],
        languages: [],
        workModes: [],
      }
    });
  }

  // Check if skill already exists (case-insensitive check could be done here or rely on specific normalization)
  // Prisma push doesn't check for duplicates automatically in the array, so we should check.
  // However, for atomic push, we can't easily check without reading. 
  // Since we read 'profile' above, we can check.
  if (profile.skills.includes(skill)) {
    return profile;
  }

  return await dbClient.userProfile.update({
    where: { user_id: userId },
    data: {
      skills: {
        push: skill
      }
    }
  });
};