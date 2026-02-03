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
  // 1. Verify that the target entity exists
  if (data.commentableType === "job") {
    const job = await prisma.job.findUnique({
      where: { id: data.commentableId },
      select: { id: true }
    });
    if (!job) throw new Error("Target job not found");
  } else if (data.commentableType === "news") {
    const news = await prisma.news.findUnique({
      where: { id: data.commentableId },
      select: { id: true }
    });
    if (!news) throw new Error("Target news not found");
  }

  // 2. If parentId is provided, verify it exists and belongs to the same entity
  if (data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: data.parentId },
      select: { id: true, commentable_id: true, commentable_type: true }
    });
    if (!parent) throw new Error("Parent comment not found");
    if (parent.commentable_id !== data.commentableId || parent.commentable_type !== data.commentableType) {
      throw new Error("Parent comment belongs to a different entity");
    }
  }

  return await prisma.comment.create({
    data: {
      content: data.content,
      user: { connect: { id: data.userId } },
      commentable_id: data.commentableId,
      commentable_type: data.commentableType,
      parent: data.parentId ? { connect: { id: data.parentId } } : undefined
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
/**
 * Get comments for an entity with pagination
 * @param commentableId - Entity ID
 * @param commentableType - Entity Type
 * @param page - Page number
 * @param limit - Number of items per page
 * @param userId - Optional User ID to check for likes and ownership
 * @returns Comments with pagination info
 */
export const getCommentsByEntity = async (
  commentableId: string,
  commentableType: string,
  page: number = 1,
  limit: number = 10,
  userId?: string
) => {
  const skip = (page - 1) * limit;

  // 1. Fetch root comments (parentId is null)
  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        commentable_id: commentableId,
        commentable_type: commentableType,
        parent: null // Use relation check to find root comments
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
        },
        replies: {
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
            created_at: "asc"
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
        commentable_type: commentableType,
        parent: null
      }
    })
  ]);

  // 2. Fetch like and dislike counts manually for all relevant comments
  // Get all comment IDs (root + replies)
  const allCommentIds = [
    ...comments.map(c => c.id),
    ...comments.flatMap(c => c.replies.map(r => r.id))
  ];

  const reactionCounts = await prisma.like.groupBy({
    by: ['likeable_id', 'type'],
    where: {
      likeable_id: { in: allCommentIds },
      likeable_type: "comment"
    },
    _count: {
      _all: true
    }
  });

  const reactionMap = new Map<string, { likes: number, dislikes: number }>();
  reactionCounts.forEach(r => {
    const current = reactionMap.get(r.likeable_id) || { likes: 0, dislikes: 0 };
    if (r.type === 'LIKE') current.likes = r._count._all;
    else if (r.type === 'DISLIKE') current.dislikes = r._count._all;
    reactionMap.set(r.likeable_id, current);
  });

  // 3. If userId is provided, check if user liked/disliked each comment
  const userReactionMap = new Map<string, "LIKE" | "DISLIKE" | null>();
  if (userId) {
    const userLikes = await prisma.like.findMany({
      where: {
        user_id: userId,
        likeable_id: { in: allCommentIds },
        likeable_type: "comment"
      },
      select: {
        likeable_id: true,
        type: true
      }
    });

    userLikes.forEach(l => {
      userReactionMap.set(l.likeable_id, l.type as "LIKE" | "DISLIKE");
    });
  }

  interface CommentWithReplies {
    id: string;
    content: string;
    user_id: string;
    commentable_id: string;
    commentable_type: string;
    created_at: Date | null;
    updated_at: Date | null;
    parentId: string | null;
    user: {
      id: string;
      first_name: string;
      last_name: string;
      avatar: string | null;
    };
    replies?: CommentWithReplies[];
  }

  interface MappedComment extends CommentWithReplies {
    likesCount: number;
    dislikesCount: number;
    userReaction: "LIKE" | "DISLIKE" | null;
    userHasLiked: boolean;
    replies: MappedComment[];
  }

  const mapComment = (c: CommentWithReplies): MappedComment => ({
    ...c,
    likesCount: reactionMap.get(c.id)?.likes || 0,
    dislikesCount: reactionMap.get(c.id)?.dislikes || 0,
    userReaction: userReactionMap.get(c.id) || null,
    userHasLiked: userReactionMap.get(c.id) === 'LIKE',
    replies: c.replies ? c.replies.map(mapComment) : []
  });

  const commentsWithLikes = comments.map(mapComment);

  return {
    comments: commentsWithLikes,
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
export const updateComment = async (id: string, content: string, userId: string, userRole: string = 'user') => {
  // Check if user is the author
  const comment = await prisma.comment.findUnique({
    where: { id }
  });

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user_id !== userId && userRole !== 'admin') {
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

  /**
   * Helper function to recursively delete comments and their likes
   */
  const recursiveDelete = async (commentId: string) => {
    // 1. Find all replies to this comment
    const replies = await prisma.comment.findMany({
      where: { parentId: commentId },
      select: { id: true }
    });

    // 2. Recursively delete each reply first (depth-first to respect constraints)
    for (const reply of replies) {
      await recursiveDelete(reply.id);
    }

    // 3. Delete all likes associated with this comment
    await prisma.like.deleteMany({
      where: {
        likeable_id: commentId,
        likeable_type: "comment"
      }
    });

    // 4. Finally delete the comment itself
    return await prisma.comment.delete({
      where: { id: commentId }
    });
  };

  return await recursiveDelete(id);
};

/**
 * Toggle like on a comment
 * @param commentId - Comment ID
 * @param userId - User ID
 * @returns Updated like status
 */
export const toggleLike = async (commentId: string, userId: string) => {
  const existingLike = await prisma.like.findUnique({
    where: {
      user_id_likeable_type_likeable_id: {
        user_id: userId,
        likeable_type: "comment",
        likeable_id: commentId
      }
    }
  });

  if (existingLike) {
    await prisma.like.delete({
      where: {
        id: existingLike.id
      }
    });
    return { liked: false };
  } else {
    await prisma.like.create({
      data: {
        likeable_id: commentId,
        likeable_type: "comment",
        user_id: userId,
        type: "LIKE"
      }
    });
    return { liked: true };
  }
};