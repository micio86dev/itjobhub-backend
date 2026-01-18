import { prisma } from "../../config/database";

export interface CommentCreateInput {
  content: string;
  userId: string;
  commentableId: string;
  commentableType: "job" | "news";
  parentId?: string;
}

/**
 * Create a new comment
 * @param data - Comment data
 * @returns Created comment
 */
export const createComment = async (data: CommentCreateInput) => {
  return await prisma.comment.create({
    data: {
      content: data.content,
      user: { connect: { id: data.userId } },
      commentable_id: data.commentableId,
      commentable_type: data.commentableType,
      parentId: data.parentId
    },
    include: {
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          avatar: true
        }
      }
    }
  });
};

/**
 * Get comments for an entity with pagination
 * @param commentableId - Entity ID
 * @param commentableType - Entity Type
 * @param page - Page number
 * @param limit - Number of items per page
 * @returns Comments with pagination info
 */
export const getCommentsByEntity = async (
  commentableId: string,
  commentableType: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        commentable_id: commentableId,
        commentable_type: commentableType
      },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            avatar: true
          }
        }
      },
      orderBy: {
        created_at: "desc"
      }
    }),
    prisma.comment.count({
      where: {
        commentable_id: commentableId,
        commentable_type: commentableType
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

  if (comment.user_id !== userId) {
    throw new Error("Not authorized to update this comment");
  }

  return await prisma.comment.update({
    where: { id },
    data: { content },
    include: {
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          avatar: true
        }
      }
    }
  });
};

/**
 * Delete comment
 * @param id - Comment ID
 * @param userId - User ID for authorization
 * @param userRole - User Role for admin override
 * @returns Deletion result
 */
export const deleteComment = async (id: string, userId: string, userRole: string = 'user') => {
  // Check if user is the author
  const comment = await prisma.comment.findUnique({
    where: { id }
  });

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user_id !== userId && userRole !== 'admin') {
    throw new Error("Not authorized to delete this comment");
  }

  return await prisma.comment.delete({
    where: { id }
  });
};