import { Elysia, t } from "elysia";
import { prisma } from "../config/database";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";

export const favoritesRoutes = new Elysia({ prefix: "/favorites" })
    .use(authMiddleware)
    /**
     * Add job to favorites
     * @method POST
     * @path /favorites
     */
    .post(
        "/",
        async ({ user, body, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return formatError("Unauthorized", 401);
                }

                // Check if already favorited
                const existing = await prisma.favorite.findUnique({
                    where: {
                        user_id_job_id: {
                            user_id: user.id,
                            job_id: body.jobId
                        }
                    }
                });

                if (existing) {
                    set.status = 409;
                    return formatError("Job already in favorites", 409);
                }

                const favorite = await prisma.favorite.create({
                    data: {
                        user_id: user.id,
                        job_id: body.jobId
                    }
                });

                return formatResponse(favorite, "Added to favorites");
            } catch (error: unknown) {
                set.status = 500;
                return formatError(`Failed to add favorite: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            body: t.Object({
                jobId: t.String()
            }),
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Object({
                        id: t.String(),
                        user_id: t.String(),
                        job_id: t.String(),
                        created_at: t.Any()
                    })
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
                tags: ["favorites"]
            }
        }
    )
    /**
     * Remove job from favorites
     * @method DELETE
     * @path /favorites
     */
    .delete(
        "/",
        async ({ user, query, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return formatError("Unauthorized", 401);
                }

                await prisma.favorite.deleteMany({
                    where: {
                        user_id: user.id,
                        job_id: query.jobId
                    }
                });

                return formatResponse(null, "Removed from favorites");
            } catch (error: unknown) {
                set.status = 500;
                return formatError(`Failed to remove favorite: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                jobId: t.String()
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
                500: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String()
                })
            },
            detail: {
                tags: ["favorites"]
            }
        }
    )
    /**
     * Get user's favorites
     * @method GET
     * @path /favorites
     */
    .get(
        "/",
        async ({ user, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return formatError("Unauthorized", 401);
                }

                const favorites = await prisma.favorite.findMany({
                    where: {
                        user_id: user.id
                    },
                    include: {
                        job: {
                            include: {
                                company: true
                            }
                        }
                    },
                    orderBy: {
                        created_at: 'desc'
                    }
                });

                return formatResponse(favorites, "Favorites retrieved successfully");
            } catch (error: unknown) {
                set.status = 500;
                return formatError(`Failed to get favorites: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Array(t.Object({
                        id: t.String(),
                        user_id: t.String(),
                        job_id: t.String(),
                        created_at: t.Any(),
                        job: t.Object({
                            id: t.String(),
                            title: t.String(),
                            description: t.Union([t.String(), t.Null()]),
                            company: t.Union([t.Object({
                                id: t.String(),
                                name: t.String(),
                                logo: t.Optional(t.Union([t.String(), t.Null()]))
                            }), t.Null()])
                        })
                    }))
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
                tags: ["favorites"]
            }
        }
    );
