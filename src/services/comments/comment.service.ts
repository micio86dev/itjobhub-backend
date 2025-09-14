import { prisma } from "../../config/database";

export interface CommentCreateInput {
  content: string;
  userId: string;
  jobId: string;
  parentId?: string;
}

/**
 * Create a new comment
 * @param data - Comment data
 * @returns Created comment
 */
export const createComment = async (data: CommentCreateInput) => {
  return await prisma.comment.create({
    data,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      replies: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });
};

/**
 * Get comments for a job with pagination
 * @param jobId - Job ID
 * @param page - Page number
 * @param limit - Number of items per page
 * @returns Comments with pagination info
 */
export const getCommentsByJob = async (jobId: string, page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  
  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        jobId,
        parentId: null // Only top-level comments
      },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.comment.count({
      where: {
        jobId,
        parentId: null
      }
    })
  ]);
  
  return {
    comments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Update comment
 * @param id - Comment ID
 * @param content - New content
 * @param userId - User ID for authorization
 * @returns Updated comment
 */
export const updateComment = async (id: string, content: string, userId: string) => {
  // Check if user is the author
  const comment = await prisma.comment.findUnique({
    where: { id }
  });
  
  if (!comment) {
    throw new Error("Comment not found");
  }
  
  if (comment.userId !== userId) {
    throw new Error("Not authorized to update this comment");
  }
  
  return await prisma.comment.update({
    where: { id },
    data: { content },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
};

/**
 * Delete comment
 * @param id - Comment ID
 * @param userId - User ID for authorization
 * @returns Deletion result
 */
export const deleteComment = async (id: string, userId: string) => {
  // Check if user is the author
  const comment = await prisma.comment.findUnique({
    where: { id }
  });
  
  if (!comment) {
    throw new Error("Comment not found");
  }
  
  if (comment.userId !== userId) {
    throw new Error("Not authorized to delete this comment");
  }
  
  return await prisma.comment.delete({
    where: { id }
  });
};