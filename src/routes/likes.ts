import { Elysia, t } from "elysia";
import {
  createLike,
  removeLike,
  getLikeCount,
  hasUserLiked,
  LikeableType
} from "../services/likes/like.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";

// Helper to determine likeable type and id from request params
const getLikeableParams = (
  jobId?: string,
  commentId?: string,
  newsId?: string
): { type: LikeableType; id: string } | null => {
  if (jobId) return { type: "job", id: jobId };
  if (commentId) return { type: "comment", id: commentId };
  if (newsId) return { type: "news", id: newsId };
  return null;
};

export const likeRoutes = new Elysia({ prefix: "/likes" })
  .use(authMiddleware)
  /**
   * Like a job or comment
   * @method POST
   * @path /likes
   */
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const likeable = getLikeableParams(body.jobId, body.commentId, body.newsId);
        if (!likeable) {
          set.status = 400;
          return formatError("Either jobId, newsId or commentId must be provided", 400);
        }

        const like = await createLike(user.id, likeable.type, likeable.id, body.type);

        return formatResponse(like, "Liked successfully");
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message === "Reaction already exists") {
          set.status = 409;
          return formatError("Already reacted", 409);
        }

        set.status = 500;
        return formatError(`Failed to like: ${message}`, 500);
      }
    },
    {
      body: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String()),
        newsId: t.Optional(t.String()),
        type: t.Optional(t.Union([t.Literal('LIKE'), t.Literal('DISLIKE')]))
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            user_id: t.String(),
            likeable_type: t.String(),
            likeable_id: t.String(),
            type: t.String(),
            created_at: t.Union([t.String(), t.Date(), t.Null()])
          })
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        409: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["likes"]
      }
    }
  )
  /**
   * Unlike a job or comment
   * @method DELETE
   * @path /likes
   */
  .delete(
    "/",
    async ({ user, query, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const likeable = getLikeableParams(query.jobId, query.commentId, query.newsId);
        if (!likeable) {
          set.status = 400;
          return formatError("Either jobId, newsId or commentId must be provided", 400);
        }

        await removeLike(user.id, likeable.type, likeable.id, query.type);

        return formatResponse(null, "Unliked successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to unlike: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String()),
        newsId: t.Optional(t.String()),
        type: t.Optional(t.Union([t.Literal('LIKE'), t.Literal('DISLIKE')]))
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["likes"]
      }
    }
  )
  /**
   * Get like count for a job or comment
   * @method GET
   * @path /likes/count
   */
  .get(
    "/count",
    async ({ query, set }) => {
      try {
        const likeable = getLikeableParams(query.jobId, query.commentId, query.newsId);
        if (!likeable) {
          set.status = 400;
          return formatError("Either jobId, newsId or commentId must be provided", 400);
        }

        const count = await getLikeCount(likeable.type, likeable.id);

        return formatResponse({ count }, "Like count retrieved successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to retrieve like count: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String()),
        newsId: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            count: t.Number()
          })
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["likes"]
      }
    }
  )
  /**
   * Check if user has liked a job or comment
   * @method GET
   * @path /likes/has-liked
   */
  .get(
    "/has-liked",
    async ({ user, query, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const likeable = getLikeableParams(query.jobId, query.commentId, query.newsId);
        if (!likeable) {
          set.status = 400;
          return formatError("Either jobId, newsId or commentId must be provided", 400);
        }

        const liked = await hasUserLiked(user.id, likeable.type, likeable.id);

        return formatResponse({ liked }, "Like status retrieved successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to retrieve like status: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String()),
        newsId: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            liked: t.Boolean()
          })
        }),
        400: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["likes"]
      }
    }
  );