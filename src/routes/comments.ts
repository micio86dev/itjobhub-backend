import { Elysia, t } from "elysia";
import {
  createComment,
  getCommentsByJob,
  updateComment,
  deleteComment
} from "../services/comments/comment.service";
import { formatResponse, formatError } from "../utils/response";

export const commentRoutes = new Elysia({ prefix: "/comments" })
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
        
        const comment = await createComment({
          ...body,
          userId: user.id
        });
        
        set.status = 201;
        return formatResponse(comment, "Comment created successfully", 201);
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to create comment", 500);
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
            userId: t.String(),
            jobId: t.Optional(t.String()),
            parentId: t.Optional(t.String()),
            createdAt: t.String(),
            updatedAt: t.String(),
            user: t.Object({
              id: t.String(),
              firstName: t.String(),
              lastName: t.String()
            }),
            replies: t.Array(t.Object({
              id: t.String(),
              content: t.String(),
              userId: t.String(),
              parentId: t.String(),
              createdAt: t.String(),
              updatedAt: t.String(),
              user: t.Object({
                id: t.String(),
                firstName: t.String(),
                lastName: t.String()
              })
            }))
          })
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
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve comments", 500);
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
              userId: t.String(),
              jobId: t.Optional(t.String()),
              parentId: t.Optional(t.String()),
              createdAt: t.String(),
              updatedAt: t.String(),
              user: t.Object({
                id: t.String(),
                firstName: t.String(),
                lastName: t.String()
              }),
              replies: t.Array(t.Object({
                id: t.String(),
                content: t.String(),
                userId: t.String(),
                parentId: t.String(),
                createdAt: t.String(),
                updatedAt: t.String(),
                user: t.Object({
                  id: t.String(),
                  firstName: t.String(),
                  lastName: t.String()
                })
              }))
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
      } catch (error: any) {
        if (error.message === "Comment not found") {
          set.status = 404;
          return formatError("Comment not found", 404);
        }
        
        if (error.message === "Not authorized to update this comment") {
          set.status = 403;
          return formatError("Forbidden: Not authorized to update this comment", 403);
        }
        
        set.status = 500;
        return formatError("Failed to update comment", 500);
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
            userId: t.String(),
            jobId: t.Optional(t.String()),
            parentId: t.Optional(t.String()),
            createdAt: t.String(),
            updatedAt: t.String(),
            user: t.Object({
              id: t.String(),
              firstName: t.String(),
              lastName: t.String()
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
        
        await deleteComment(params.id, user.id);
        
        return formatResponse(null, "Comment deleted successfully");
      } catch (error: any) {
        if (error.message === "Comment not found") {
          set.status = 404;
          return formatError("Comment not found", 404);
        }
        
        if (error.message === "Not authorized to delete this comment") {
          set.status = 403;
          return formatError("Forbidden: Not authorized to delete this comment", 403);
        }
        
        set.status = 500;
        return formatError("Failed to delete comment", 500);
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