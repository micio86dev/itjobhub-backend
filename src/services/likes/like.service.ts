import { prisma } from "../../config/database";

// Supported likeable types
export type LikeableType = "job" | "comment";
export type LikeType = "LIKE" | "DISLIKE";

/**
 * Calculate Trust Score based on likes and dislikes
 * Formula: ((likes + 8) / (likes + dislikes + 10)) * 100
 * This gives an initial 80% score (8/10) and adjusts as real data comes in.
 */
const calculateTrustScore = (likes: number, dislikes: number): number => {
  return ((likes + 8) / (likes + dislikes + 10)) * 100;
};

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

      // Update Company Trust Score
      if (likeableType === 'job') {
        const job = await tx.job.findUnique({
          where: { id: likeableId },
          select: { company_id: true }
        });

        if (job && job.company_id) {
          const company = await tx.company.findUnique({
            where: { id: job.company_id },
            select: { totalLikes: true, totalDislikes: true }
          });

          if (company) {
            let newLikes = company.totalLikes;
            let newDislikes = company.totalDislikes;

            if (type === 'LIKE') {
              newLikes++;
              newDislikes--;
            } else {
              newLikes--;
              newDislikes++;
            }

            newLikes = Math.max(0, newLikes);
            newDislikes = Math.max(0, newDislikes);

            const newScore = calculateTrustScore(newLikes, newDislikes);

            await tx.company.update({
              where: { id: job.company_id },
              data: {
                totalLikes: newLikes,
                totalDislikes: newDislikes,
                trustScore: newScore
              }
            });
          }
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
        const company = await tx.company.findUnique({
          where: { id: job.company_id },
          select: { totalLikes: true, totalDislikes: true, totalRatings: true }
        });

        if (company) {
          const newLikes = company.totalLikes + (type === 'LIKE' ? 1 : 0);
          const newDislikes = company.totalDislikes + (type === 'DISLIKE' ? 1 : 0);
          const newScore = calculateTrustScore(newLikes, newDislikes);

          await tx.company.update({
            where: { id: job.company_id },
            data: {
              totalLikes: newLikes,
              totalDislikes: newDislikes,
              trustScore: newScore,
              totalRatings: company.totalRatings + 1
            }
          });
        }
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

    await tx.like.delete({
      where: { id: existingLike.id }
    });

    if (likeableType === 'job') {
      const job = await tx.job.findUnique({
        where: { id: likeableId },
        select: { company_id: true }
      });

      if (job && job.company_id) {
        const company = await tx.company.findUnique({
          where: { id: job.company_id },
          select: { totalLikes: true, totalDislikes: true, totalRatings: true }
        });

        if (company) {
          const newLikes = Math.max(0, company.totalLikes - (existingLike.type === 'LIKE' ? 1 : 0));
          const newDislikes = Math.max(0, company.totalDislikes - (existingLike.type === 'DISLIKE' ? 1 : 0));
          const newScore = calculateTrustScore(newLikes, newDislikes);

          await tx.company.update({
            where: { id: job.company_id },
            data: {
              totalLikes: newLikes,
              totalDislikes: newDislikes,
              trustScore: newScore,
              totalRatings: Math.max(0, company.totalRatings - 1)
            }
          });
        }
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