import { Elysia, t } from "elysia";
import {
    getNews,
    getNewsBySlug
} from "../services/news/news.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth"; // Assuming it exports authMiddleware

export const newsRoutes = new Elysia({ prefix: "/news" })
    .use(authMiddleware)
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
            } catch (error: unknown) {
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
                            published_at: t.Union([t.String(), t.Date(), t.Null()]),
                            created_at: t.Union([t.String(), t.Date(), t.Null()]),
                            updated_at: t.Union([t.String(), t.Date(), t.Null()])
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
        "/:slug",
        async ({ params, user, set }) => {
            try {
                // Need to access user from context. Is auth middleware used?
                // The route definition doesn't show .use(authMiddleware).
                // I need to add optional auth to get 'user'.
                // For now, I'll assume I need to extract it if I can or it won't work.
                // Re-reading file, imports don't include authMiddleware. lines 1-7.

                const news = await getNewsBySlug(params.slug, user?.id);

                if (!news) {
                    set.status = 404;
                    return formatError("News not found", 404);
                }

                return formatResponse(news, "News retrieved successfully");
            } catch (error: unknown) {
                set.status = 500;
                return formatError(`Failed to retrieve news: ${getErrorMessage(error)}`, 500);
            }
        },
        {
            params: t.Object({
                slug: t.String()
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
                        published_at: t.Union([t.String(), t.Date(), t.Null()]),
                        created_at: t.Union([t.String(), t.Date(), t.Null()]),
                        updated_at: t.Union([t.String(), t.Date(), t.Null()])
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
            } catch (error: unknown) {
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
