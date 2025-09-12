import { prisma } from "../../config/database";

/**
 * Create a like for a job or comment
 * @param userId - User ID
 * @param jobId - Job ID (optional)
 * @param commentId - Comment ID (optional)
 * @returns Created like
 */
export const createLike = async (userId: string, jobId?: string, commentId?: string) => {
  // Check if like already exists
  const existingLike = await prisma.like.findFirst({
    where: {
      userId,
      jobId: jobId || undefined,
      commentId: commentId || undefined
    }
  });
  
  if (existingLike) {
    throw new Error("Like already exists");
  }
  
  return await prisma.like.create({
    data: {
      userId,
      jobId: jobId || undefined,
      commentId: commentId || undefined
    }
  });
};

/**
 * Remove a like
 * @param userId - User ID
 * @param jobId - Job ID (optional)
 * @param commentId - Comment ID (optional)
 * @returns Deletion result
 */
export const removeLike = async (userId: string, jobId?: string, commentId?: string) => {
  return await prisma.like.deleteMany({
    where: {
      userId,
      jobId: jobId || undefined,
      commentId: commentId || undefined
    }
  });
};

/**
 * Get like count for a job or comment
 * @param jobId - Job ID (optional)
 * @param commentId - Comment ID (optional)
 * @returns Like count
 */
export const getLikeCount = async (jobId?: string, commentId?: string) => {
  return await prisma.like.count({
    where: {
      jobId: jobId || undefined,
      commentId: commentId || undefined
    }
  });
};

/**
 * Check if user has liked a job or comment
 * @param userId - User ID
 * @param jobId - Job ID (optional)
 * @param commentId - Comment ID (optional)
 * @returns Boolean indicating if user has liked
 */
export const hasUserLiked = async (userId: string, jobId?: string, commentId?: string) => {
  const like = await prisma.like.findFirst({
    where: {
      userId,
      jobId: jobId || undefined,
      commentId: commentId || undefined
    }
  });
  
  return !!like;
};