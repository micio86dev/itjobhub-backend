import { Elysia, t } from "elysia";
import {
  createComment,
  getCommentsByJob,
  updateComment,
  deleteComment
} from "../services/comments/comment.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";

export const commentRoutes = new Elysia({ prefix: "/comments" })
  .use(authMiddleware)
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

        if (!body.jobId) {
          set.status = 400;
          return formatError("jobId is required", 400);
        }

        const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
        if (!isValidObjectId(body.jobId)) {
          set.status = 400;
          return formatError("Invalid jobId format", 400);
        }

        const comment = await createComment({
          content: body.content,
          userId: user.id,
          jobId: body.jobId,
          parentId: body.parentId
        });

        set.status = 201;
        return formatResponse(comment, "Comment created successfully", 201);
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to create comment: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      body: t.Object({
        content: t.String({ minLength: 1 }),
        jobId: t.Optional(t.String()),
        parentId: t.Optional(t.String())
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            content: t.String(),
            user_id: t.String(),
            job_id: t.Optional(t.String()),
            created_at: t.Any(),
            updated_at: t.Any(),
            user: t.Object({
              id: t.String(),
              first_name: t.String(),
              last_name: t.String(),
              avatar: t.Union([t.String(), t.Null()])
            })
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
        tags: ["comments"]
      }
    }
  )
  /**
   * Get comments for a job with pagination
   * @method GET
   * @path /comments/job/:jobId
   */
  .get(
    "/job/:jobId",
    async ({ params, query, set }) => {
      try {
        const page = parseInt(query.page || "1");
        const limit = parseInt(query.limit || "10");

        const result = await getCommentsByJob(params.jobId, page, limit);

        return formatResponse(result, "Comments retrieved successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to retrieve comments: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      params: t.Object({
        jobId: t.String()
      }),
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            comments: t.Array(t.Object({
              id: t.String(),
              content: t.String(),
              user_id: t.String(),
              job_id: t.Optional(t.String()),
              parentId: t.Optional(t.String()),
              created_at: t.Any(),
              updated_at: t.Any(),
              user: t.Object({
                id: t.String(),
                first_name: t.String(),
                last_name: t.String(),
                avatar: t.Union([t.String(), t.Null()])
              }),
              replies: t.Optional(t.Array(t.Object({
                id: t.String(),
                content: t.String(),
                user_id: t.String(),
                parentId: t.String(),
                created_at: t.Any(),
                updated_at: t.Any(),
                user: t.Object({
                  id: t.String(),
                  first_name: t.String(),
                  last_name: t.String(),
                  avatar: t.Union([t.String(), t.Null()])
                })
              })))
            })),
            pagination: t.Object({
              page: t.Number(),
              limit: t.Number(),
              total: t.Number(),
              pages: t.Number()
            })
          })
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
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

        const comment = await updateComment(params.id, body.content, user.id);

        return formatResponse(comment, "Comment updated successfully");
      } catch (error: unknown) {
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
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            content: t.String(),
            user_id: t.String(),
            job_id: t.Optional(t.String()),
            parentId: t.Optional(t.String()),
            created_at: t.Any(),
            updated_at: t.Any(),
            user: t.Object({
              id: t.String(),
              first_name: t.String(),
              last_name: t.String(),
              avatar: t.Union([t.String(), t.Null()])
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        404: t.Object({
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
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        await deleteComment(params.id, user.id, user.role);

        return formatResponse(null, "Comment deleted successfully");
      } catch (error: unknown) {
        const message = getErrorMessage(error);
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
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        404: t.Object({
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
        tags: ["comments"]
      }
    }
  );