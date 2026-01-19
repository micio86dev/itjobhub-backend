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

                // Step 1: Fetch favorites WITHOUT include to avoid Prisma failing on orphan records
                const favoritesRaw = await prisma.favorite.findMany({
                    where: {
                        user_id: user.id
                    },
                    orderBy: {
                        created_at: 'desc'
                    }
                });

                // Extract job IDs
                const jobIds = favoritesRaw.map(f => f.job_id);

                // Step 2: Fetch only jobs that actually exist
                const jobs = await prisma.job.findMany({
                    where: {
                        id: { in: jobIds }
                    },
                    include: {
                        company: true
                    }
                });

                // Create a map for quick job lookup
                const jobsMap = new Map(jobs.map(j => [j.id, j]));

                // Identify missing jobs and delete their favorites globally
                const existingJobIds = new Set(jobs.map(j => j.id));
                const missingJobIds = jobIds.filter(id => !existingJobIds.has(id));

                if (missingJobIds.length > 0) {
                    await prisma.favorite.deleteMany({
                        where: {
                            job_id: { in: missingJobIds }
                        }
                    });
                }

                // Filter favorites to only those with existing jobs
                const validFavorites = favoritesRaw.filter(f => jobsMap.has(f.job_id));
                const validJobIds = validFavorites.map(f => f.job_id);

                // Fetch all likes for these jobs
                const allLikes = await prisma.like.findMany({
                    where: {
                        likeable_type: 'job',
                        likeable_id: { in: validJobIds }
                    }
                });

                // Fetch all comments for these jobs
                const allComments = await prisma.comment.findMany({
                    where: {
                        commentable_type: 'job',
                        commentable_id: { in: validJobIds }
                    },
                    select: { id: true, commentable_id: true }
                });

                const formattedFavorites = validFavorites.map(fav => {
                    const job = jobsMap.get(fav.job_id)!;

                    // Filter likes for this specific job
                    const jobLikes = allLikes.filter(l => l.likeable_id === job.id);

                    // Filter comments for this specific job
                    const jobComments = allComments.filter(c => c.commentable_id === job.id);

                    const likesCount = jobLikes.filter(l => l.type === 'LIKE').length;
                    const dislikesCount = jobLikes.filter(l => l.type === 'DISLIKE').length;
                    const userReaction = jobLikes.find(l => l.user_id === user.id)?.type || null;
                    const commentsCount = jobComments.length;

                    return {
                        ...fav,
                        job: {
                            ...job,
                            likes: likesCount,
                            dislikes: dislikesCount,
                            user_reaction: userReaction,
                            comments_count: commentsCount
                        }
                    };
                });

                return formatResponse(formattedFavorites, "Favorites retrieved successfully");
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
                        created_at: t.Union([t.String(), t.Date(), t.Null()]),
                        job: t.Object({
                            id: t.String(),
                            title: t.String(),
                            description: t.Union([t.String(), t.Null()]),
                            company_id: t.Union([t.String(), t.Null()]),
                            location: t.Optional(t.Union([t.String(), t.Null()])),
                            salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
                            salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
                            seniority: t.Optional(t.Union([t.String(), t.Null()])),
                            skills: t.Array(t.String()),
                            technical_skills: t.Optional(t.Array(t.String())),
                            employment_type: t.Optional(t.Union([t.String(), t.Null()])),
                            experience_level: t.Optional(t.Union([t.String(), t.Null()])),
                            remote: t.Boolean(),
                            is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])),
                            published_at: t.Union([t.String(), t.Date(), t.Null()]),
                            expires_at: t.Union([t.String(), t.Date(), t.Null()]),
                            created_at: t.Union([t.String(), t.Date(), t.Null()]),
                            updated_at: t.Union([t.String(), t.Date(), t.Null()]),
                            link: t.Optional(t.Union([t.String(), t.Null()])),
                            source: t.Optional(t.Union([t.String(), t.Null()])),
                            language: t.Optional(t.Union([t.String(), t.Null()])),
                            likes: t.Number(),
                            dislikes: t.Number(),
                            user_reaction: t.Union([t.String(), t.Null()]),
                            comments_count: t.Number(),
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
