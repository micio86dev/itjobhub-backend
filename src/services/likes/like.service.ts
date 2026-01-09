import { prisma } from "../../config/database";

// Supported likeable types
export type LikeableType = "job" | "comment";

/**
 * Create a like for any entity (job, comment, etc.)
 * @param userId - User ID
 * @param likeableType - Type of entity ("job" | "comment")
 * @param likeableId - Entity ID
 * @returns Created like
 */
export const createLike = async (
  userId: string,
  likeableType: LikeableType,
  likeableId: string
) => {
  // Check if like already exists
  const existingLike = await prisma.like.findFirst({
    where: {
      user_id: userId,
      likeable_type: likeableType,
      likeable_id: likeableId
    }
  });

  if (existingLike) {
    throw new Error("Like already exists");
  }

  return await prisma.like.create({
    data: {
      user_id: userId,
      likeable_type: likeableType,
      likeable_id: likeableId
    }
  });
};

/**
 * Remove a like
 * @param userId - User ID
 * @param likeableType - Type of entity ("job" | "comment")
 * @param likeableId - Entity ID
 * @returns Deletion result
 */
export const removeLike = async (
  userId: string,
  likeableType: LikeableType,
  likeableId: string
) => {
  return await prisma.like.deleteMany({
    where: {
      user_id: userId,
      likeable_type: likeableType,
      likeable_id: likeableId
    }
  });
};

/**
 * Get like count for any entity
 * @param likeableType - Type of entity ("job" | "comment")
 * @param likeableId - Entity ID
 * @returns Like count
 */
export const getLikeCount = async (
  likeableType: LikeableType,
  likeableId: string
) => {
  return await prisma.like.count({
    where: {
      likeable_type: likeableType,
      likeable_id: likeableId
    }
  });
};

/**
 * Check if user has liked an entity
 * @param userId - User ID
 * @param likeableType - Type of entity ("job" | "comment")
 * @param likeableId - Entity ID
 * @returns Boolean indicating if user has liked
 */
export const hasUserLiked = async (
  userId: string,
  likeableType: LikeableType,
  likeableId: string
) => {
  const like = await prisma.like.findFirst({
    where: {
      user_id: userId,
      likeable_type: likeableType,
      likeable_id: likeableId
    }
  });

  return !!like;
};