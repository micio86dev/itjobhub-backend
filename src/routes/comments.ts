import { Elysia, t } from "elysia";
import {
  createComment,
  getCommentsByEntity,
  updateComment,
  deleteComment,
  toggleLike
} from "../services/comments/comment.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";
import logger from "../utils/logger";

export const commentRoutes = new Elysia({ prefix: "/comments" })
  .use(authMiddleware)
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      logger.error({ validationError: error.all }, "Comment Route Validation Error");
      set.status = 422;
      return {
        success: false,
        status: 422,
        message: "Validation Error",
        errors: error.all
      };
    }
  })
  /**
   * Create a new comment
   * @method POST
   * @path /comments
   */
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        if (!body.commentableId || !body.commentableType) {
          set.status = 400;
          return formatError("commentableId and commentableType are required", 400);
        }

        const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
        if (!isValidObjectId(body.commentableId)) {
          set.status = 400;
          return formatError("Invalid commentableId format", 400);
        }

        const comment = await createComment({
          content: body.content,
          userId: user.id,
          commentableId: body.commentableId,
          commentableType: body.commentableType as "job" | "news",
          parentId: body.parentId || undefined
        });

        set.status = 201;
        return formatResponse(comment, "Comment created successfully", 201);
      } catch (error) {
        const message = getErrorMessage(error);
        if (message.includes("not found")) {
          set.status = 404;
          return formatError(message, 404);
        }
        if (message.includes("different entity")) {
          set.status = 400;
          return formatError(message, 400);
        }
        set.status = 500;
        return formatError(`Failed to create comment: ${message}`, 500);
      }
    },
    {
      body: t.Object({
        content: t.String({ minLength: 1 }),
        commentableId: t.String(),
        commentableType: t.Union([t.Literal("job"), t.Literal("news")]),
        parentId: t.Optional(t.Union([t.String(), t.Null()]))
      }),
      detail: {
        tags: ["comments"]
      }
    }
  )
  .get(
    "/:type/:id",
    async ({ params, query, set, user }) => {
      try {
        const page = parseInt(query.page || "1");
        const limit = parseInt(query.limit || "10");

        if (params.type !== "job" && params.type !== "news") {
          set.status = 400;
          return formatError("Invalid entity type. Must be 'job' or 'news'", 400);
        }

        const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
        if (!isValidObjectId(params.id)) {
          set.status = 400;
          return formatError("Invalid entity ID format", 400);
        }

        const result = await getCommentsByEntity(params.id, params.type, page, limit, user?.id);

        return formatResponse(result, "Comments retrieved successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to retrieve comments: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      params: t.Object({
        type: t.String(),
        id: t.String()
      }),
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String())
      }),
      detail: {
        tags: ["comments"]
      }
    }
  )
  /**
   * Toggle like on a comment
   * @method POST
   * @path /comments/:id/like
   */
  .post(
    "/:id/like",
    async ({ user, params, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const result = await toggleLike(params.id, user.id);

        return formatResponse(result, "Like toggled successfully");
      } catch (error) {
        set.status = 500;
        return formatError(`Failed to toggle like: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["comments"]
      }
    }
  )
  /**
   * Update comment
   * @method PUT
   * @path /comments/:id
   */
  .put(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        const comment = await updateComment(params.id, body.content, user.id, user.role);

        return formatResponse(comment, "Comment updated successfully");
      } catch (error) {
        const message = getErrorMessage(error);
        if (message === "Comment not found") {
          set.status = 404;
          return formatError("Comment not found", 404);
        }

        if (message === "Not authorized to update this comment") {
          set.status = 403;
          return formatError("Forbidden: Not authorized to update this comment", 403);
        }

        set.status = 500;
        return formatError(`Failed to update comment: ${message}`, 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        content: t.String({ minLength: 1 })
      }),
      detail: {
        tags: ["comments"]
      }
    }
  )
  /**
   * Delete comment
   * @method DELETE
   * @path /comments/:id
   */
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        logger.warn({ user, params: params.id }, "DELETE /comments/:id called");

        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        logger.warn({ commentId: params.id, userId: user.id, userRole: user.role }, "User attempting to delete comment");
        await deleteComment(params.id, user.id, user.role);

        return formatResponse(null, "Comment deleted successfully");
      } catch (error) {
        const message = getErrorMessage(error);
        logger.warn({ error: message, commentId: params.id, userId: user?.id }, "Delete comment failed");

        if (message === "Comment not found") {
          set.status = 404;
          return formatError("Comment not found", 404);
        }

        if (message === "Not authorized to delete this comment") {
          set.status = 403;
          return formatError("Forbidden: Not authorized to delete this comment", 403);
        }

        set.status = 500;
        return formatError(`Failed to delete comment: ${message}`, 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        tags: ["comments"]
      }
    }
  );