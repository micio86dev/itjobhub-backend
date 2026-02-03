import { Elysia, t } from "elysia";
import {
    getNews,
    getNewsBySlug,
    deleteNews,
    createNews
} from "../services/news/news.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";

// Schema for NewsTranslation
const NewsTranslation = t.Object({
    language: t.String(),
    title: t.String(),
    summary: t.Optional(t.Union([t.String(), t.Null()])),
    content: t.Optional(t.Union([t.String(), t.Null()]))
});

export const newsRoutes = new Elysia({ prefix: "/news" })
    .use(authMiddleware)
    /**
     * Create a news article
     * @method POST
     * @path /news
     */
    .post(
        "/",
        async ({ body, user, set }) => {
            try {
                if (user?.role !== "admin") {
                    set.status = 403;
                    return formatError("Forbidden", 403);
                }

                const news = await createNews({
                    ...body,
                    published_at: body.published_at ? new Date(body.published_at) : undefined,
                    translations: body.translations?.map(t => ({
                        language: t.language,
                        title: t.title,
                        summary: t.summary || undefined,
                        content: t.content || undefined
                    }))
                });
                return formatResponse(news, "News created successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to create news: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            body: t.Object({
                title: t.String(),
                slug: t.String(),
                summary: t.Optional(t.String()),
                content: t.Optional(t.String()),
                image_url: t.Optional(t.String()),
                category: t.Optional(t.String()),
                language: t.Optional(t.String()),
                translations: t.Optional(t.Array(NewsTranslation)),
                published_at: t.Optional(t.Union([t.String(), t.Date()]))
            }),
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Object({
                        id: t.String(),
                        title: t.String(),
                        slug: t.String(),
                        // other fields omitted for brevity in response schema, usually create returns basic info or full object
                        // matching service return type which is Prisma News model
                        // Just returning basic fields to pass validation strictly or allow Unknown for flexibility during dev
                        // But I should be strict.
                    })
                }),
                403: t.Object({
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
                tags: ["news"]
            }
        }
    )
    /**
     * Import a news article
     * @method POST
     * @path /news/import
     */
    .post(
        "/import",
        async ({ body, user, set }) => {
            try {
                if (user?.role !== "admin") {
                    set.status = 403;
                    return formatError("Forbidden", 403);
                }

                const { importNews } = await import("../services/news/news.service");
                const news = await importNews({
                    ...body,
                    published_at: body.published_at ? new Date(body.published_at) : undefined,
                    translations: body.translations?.map(t => ({
                        language: t.language,
                        title: t.title,
                        summary: t.summary || undefined,
                        content: t.content || undefined
                    }))
                });
                return formatResponse(news, "News imported successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to import news: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            body: t.Object({
                title: t.String(),
                slug: t.String(),
                summary: t.Optional(t.String()),
                content: t.Optional(t.String()),
                video_url: t.Optional(t.String()),
                image_url: t.Optional(t.String()),
                source_url: t.Optional(t.String()),
                category: t.Optional(t.String()),
                language: t.Optional(t.String()),
                translations: t.Optional(t.Array(NewsTranslation)),
                published_at: t.Optional(t.Union([t.String(), t.Date()]))
            }),
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Unknown()
                }),
                403: t.Object({
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
                tags: ["news"]
            }
        }
    )
    /**
     * Get all news with pagination and filters
     * @method GET
     * @path /news
     */
    .get(
        "/",
        async ({ query, user, set }) => {
            try {
                const page = parseInt(query.page || "1");
                const limit = parseInt(query.limit || "10");
                const category = query.category;
                const language = query.language;

                const result = await getNews(page, limit, {
                    category,
                    language,
                    is_published: true
                }, user?.id);

                return formatResponse(result, "News retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to retrieve news: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                category: t.Optional(t.String()),
                language: t.Optional(t.String())
            }),
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Object({
                        news: t.Array(t.Object({
                            id: t.String(),
                            title: t.String(),
                            slug: t.String(),
                            summary: t.Union([t.String(), t.Null()]),
                            content: t.Union([t.String(), t.Null()]),
                            source_url: t.Union([t.String(), t.Null()]),
                            image_url: t.Union([t.String(), t.Null()]),
                            category: t.Union([t.String(), t.Null()]),
                            language: t.Union([t.String(), t.Null()]),
                            translations: t.Array(NewsTranslation),
                            published_at: t.Union([t.String(), t.Date(), t.Null()]),
                            created_at: t.Union([t.String(), t.Date(), t.Null()]),
                            updated_at: t.Union([t.String(), t.Date(), t.Null()]),
                            likes: t.Number(),
                            dislikes: t.Number(),
                            comments_count: t.Number(),
                            user_reaction: t.Union([t.String(), t.Null()])
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
                tags: ["news"]
            }
        }
    )
    /**
     * Get a single news article by slug
     * @method GET
     * @path /news/:slug
     */
    .get(
        "/:id",
        async ({ params, user, set }) => {
            try {
                const news = await getNewsBySlug(params.id, user?.id);

                if (!news) {
                    set.status = 404;
                    return formatError("News not found", 404);
                }

                return formatResponse(news, "News retrieved successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to retrieve news: ${getErrorMessage(error)}`, 500);
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
                    message: t.String(),
                    data: t.Object({
                        id: t.String(),
                        title: t.String(),
                        slug: t.String(),
                        summary: t.Union([t.String(), t.Null()]),
                        content: t.Union([t.String(), t.Null()]),
                        source_url: t.Union([t.String(), t.Null()]),
                        image_url: t.Union([t.String(), t.Null()]),
                        category: t.Union([t.String(), t.Null()]),
                        language: t.Union([t.String(), t.Null()]),
                        translations: t.Array(NewsTranslation),
                        published_at: t.Union([t.String(), t.Date(), t.Null()]),
                        created_at: t.Union([t.String(), t.Date(), t.Null()]),
                        updated_at: t.Union([t.String(), t.Date(), t.Null()]),
                        likes: t.Number(),
                        dislikes: t.Number(),
                        comments_count: t.Number(),
                        user_reaction: t.Union([t.String(), t.Null()])
                    })
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
                tags: ["news"]
            }
        }
    )
    /**
     * Delete a news article
     * @method DELETE
     * @path /news/:id
     */
    .delete(
        "/:id",
        async ({ params, user, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return formatError("Unauthorized", 401);
                }

                if (user.role !== "admin") {
                    set.status = 403;
                    return formatError("Forbidden", 403);
                }

                await deleteNews(params.id);
                return formatResponse(null, "News deleted successfully");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to delete news: ${getErrorMessage(error)}`, 500);
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
                500: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String()
                })
            },
            detail: {
                tags: ["news"]
            }
        }
    )
    /**
     * Track news interaction (view or click)
     * @method POST
     * @path /news/:id/track
     */
    .post(
        "/:id/track",
        async ({ params, body, user, set }) => {
            try {
                const { type, fingerprint } = body;
                // Import assuming it's exported from service now
                const { trackNewsInteraction } = await import("../services/news/news.service");

                const result = await trackNewsInteraction(
                    params.id,
                    type as 'VIEW' | 'CLICK',
                    user?.id,
                    fingerprint
                );

                return formatResponse(result, "Interaction tracked");
            } catch (error) {
                set.status = 500;
                return formatError(`Failed to track interaction: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({
                id: t.String()
            }),
            body: t.Object({
                type: t.Union([t.Literal('VIEW'), t.Literal('CLICK')]),
                fingerprint: t.Optional(t.String())
            }),
            response: {
                200: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String(),
                    data: t.Unknown()
                }),
                500: t.Object({
                    success: t.Boolean(),
                    status: t.Number(),
                    message: t.String()
                })
            },
            detail: {
                tags: ["news"]
            }
        }
    );
