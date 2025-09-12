import { Elysia, t } from "elysia";
import {
  createLike,
  removeLike,
  getLikeCount,
  hasUserLiked
} from "../services/likes/like.service";
import { formatResponse, formatError } from "../utils/response";

export const likeRoutes = new Elysia({ prefix: "/likes" })
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
        
        // Must provide either jobId or commentId
        if (!body.jobId && !body.commentId) {
          set.status = 400;
          return formatError("Either jobId or commentId must be provided", 400);
        }
        
        const like = await createLike(user.id, body.jobId, body.commentId);
        
        return formatResponse(like, "Liked successfully");
      } catch (error: any) {
        if (error.message === "Like already exists") {
          set.status = 409;
          return formatError("Already liked", 409);
        }
        
        set.status = 500;
        return formatError("Failed to like", 500);
      }
    },
    {
      body: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            userId: t.String(),
            jobId: t.Optional(t.String()),
            commentId: t.Optional(t.String()),
            createdAt: t.String()
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
        
        // Must provide either jobId or commentId
        if (!query.jobId && !query.commentId) {
          set.status = 400;
          return formatError("Either jobId or commentId must be provided", 400);
        }
        
        await removeLike(user.id, query.jobId, query.commentId);
        
        return formatResponse(null, "Unliked successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to unlike", 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String())
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
        // Must provide either jobId or commentId
        if (!query.jobId && !query.commentId) {
          set.status = 400;
          return formatError("Either jobId or commentId must be provided", 400);
        }
        
        const count = await getLikeCount(query.jobId, query.commentId);
        
        return formatResponse({ count }, "Like count retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve like count", 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String())
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
        
        // Must provide either jobId or commentId
        if (!query.jobId && !query.commentId) {
          set.status = 400;
          return formatError("Either jobId or commentId must be provided", 400);
        }
        
        const liked = await hasUserLiked(user.id, query.jobId, query.commentId);
        
        return formatResponse({ liked }, "Like status retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve like status", 500);
      }
    },
    {
      query: t.Object({
        jobId: t.Optional(t.String()),
        commentId: t.Optional(t.String())
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