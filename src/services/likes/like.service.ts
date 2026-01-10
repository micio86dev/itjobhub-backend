import { prisma } from "../../config/database";

// Supported likeable types
export type LikeableType = "job" | "comment";
export type LikeType = "LIKE" | "DISLIKE";

/**
 * Create a like for any entity (job, comment, etc.)
 * @param userId - User ID
 * @param likeableType - Type of entity ("job" | "comment")
 * @param likeableId - Entity ID
 * @param type - Type of reaction ("LIKE" | "DISLIKE")
 * @returns Created like
 */
export const createLike = async (
  userId: string,
  likeableType: LikeableType,
  likeableId: string,
  type: LikeType = "LIKE"
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
    if (existingLike.type === type) {
      throw new Error("Reaction already exists");
    }

    // Swap reaction (Like <-> Dislike)
    return await prisma.$transaction(async (tx) => {
      // Delete old
      await tx.like.delete({
        where: { id: existingLike.id }
      });

      // Create new
      const like = await tx.like.create({
        data: {
          user_id: userId,
          likeable_type: likeableType,
          likeable_id: likeableId,
          type: type
        }
      });

      // Update Trust Score
      if (likeableType === 'job') {
        const job = await tx.job.findUnique({
          where: { id: likeableId },
          select: { company_id: true }
        });

        if (job && job.company_id) {
          // Calculate score change:
          // Like -> Dislike : -0.1 (remove like) - 0.1 (add dislike) = -0.2
          // Dislike -> Like : +0.1 (remove dislike) + 0.1 (add like) = +0.2
          const scoreChange = type === 'LIKE' ? 0.2 : -0.2;

          await tx.company.update({
            where: { id: job.company_id },
            data: {
              trustScore: { increment: scoreChange }
            }
          });
        }
      }
      return like;
    });
  }

  // New reaction
  return await prisma.$transaction(async (tx) => {
    const like = await tx.like.create({
      data: {
        user_id: userId,
        likeable_type: likeableType,
        likeable_id: likeableId,
        type: type
      }
    });

    // Update Company Trust Score if it's a job like
    if (likeableType === 'job') {
      const job = await tx.job.findUnique({
        where: { id: likeableId },
        select: { company_id: true }
      });

      if (job && job.company_id) {
        const scoreChange = type === 'LIKE' ? 0.1 : -0.1;
        await tx.company.update({
          where: { id: job.company_id },
          data: {
            trustScore: { increment: scoreChange },
            totalRatings: { increment: 1 }
          }
        });
      }
    }

    return like;
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
  return await prisma.$transaction(async (tx) => {
    // Find first to know type
    const existingLike = await tx.like.findFirst({
      where: {
        user_id: userId,
        likeable_type: likeableType,
        likeable_id: likeableId
      }
    });

    if (!existingLike) {
      return { count: 0 };
    }

    const result = await tx.like.delete({
      where: { id: existingLike.id }
    });

    if (likeableType === 'job') {
      const job = await tx.job.findUnique({
        where: { id: likeableId },
        select: { company_id: true }
      });

      if (job && job.company_id) {
        // Revert score:
        // Removing LIKE -> -0.1
        // Removing DISLIKE -> +0.1
        const scoreChange = existingLike.type === 'LIKE' ? -0.1 : 0.1;

        await tx.company.update({
          where: { id: job.company_id },
          data: {
            trustScore: { increment: scoreChange },
            totalRatings: { decrement: 1 }
          }
        });
      }
    }

    return { count: 1 };
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