import { prisma } from "../../config/database";

export interface NewsTranslationInput {
    language: string;
    title: string;
    summary?: string;
    content?: string;
}

export interface NewsCreateInput {
    title: string;
    slug: string;
    summary?: string;
    content?: string;
    source_url?: string;
    image_url?: string;
    category?: string;
    language?: string;
    translations?: NewsTranslationInput[];
    is_published?: boolean;
    published_at?: Date;
}

/**
 * Create a new news article
 * @param data - News data
 * @returns Created news article
 */
export const createNews = async (data: NewsCreateInput) => {
    return await prisma.news.create({
        data: {
            ...data,
            published_at: data.published_at || new Date(),
        }
    });
};

/**
 * Import a news article (handling duplicates via slug or source_url)
 * @param data - News data
 * @returns Created or updated news article
 */
export const importNews = async (data: NewsCreateInput) => {
    const existing = await prisma.news.findFirst({
        where: {
            OR: [
                { slug: data.slug },
                { source_url: data.source_url }
            ]
        }
    });

    if (existing) {
        return await prisma.news.update({
            where: { id: existing.id },
            data: {
                ...data,
                views_count: undefined,
                clicks_count: undefined
            }
        });
    }

    return await createNews(data);
};



/**
 * Get news articles with pagination
 * @param page - Page number
 * @param limit - Number of items per page
 * @param filters - Filters for category, language, etc.
 * @returns News articles with pagination info
 */
export const getNews = async (
    page: number = 1,
    limit: number = 10,
    filters: { category?: string; language?: string; is_published?: boolean } = {},
    userId?: string
) => {
    const skip = (page - 1) * limit;

    const [newsRaw, total] = await Promise.all([
        prisma.news.findMany({
            where: {
                ...filters,
            },
            skip,
            take: limit,
            orderBy: {
                published_at: "desc"
            }
        }),
        prisma.news.count({
            where: {
                ...filters,
            }
        })
    ]);

    // Aggregate likes, dislikes, views, clicks for these news
    const newsIds = newsRaw.map(n => n.id);
    const [reactionCounts, interactionCounts, userReactions, commentCounts] = await Promise.all([
        prisma.like.groupBy({
            by: ['likeable_id', 'type'],
            where: {
                likeable_type: 'news',
                likeable_id: { in: newsIds }
            },
            _count: {
                _all: true
            }
        }),
        prisma.interaction.groupBy({
            by: ['trackable_id', 'type'],
            where: {
                trackable_type: 'news',
                trackable_id: { in: newsIds }
            },
            _count: {
                _all: true
            }
        }),
        // Fetch user specific reactions if userId is provided
        userId ? prisma.like.findMany({
            where: {
                user_id: userId,
                likeable_type: 'news',
                likeable_id: { in: newsIds }
            }
        }) : Promise.resolve([]),
        // Fetch comment counts
        prisma.comment.groupBy({
            by: ['commentable_id'],
            where: {
                commentable_type: 'news',
                commentable_id: { in: newsIds }
            },
            _count: {
                _all: true
            }
        })
    ]);

    // Map counts to news
    const likeCountMap = new Map<string, number>();
    const dislikeCountMap = new Map<string, number>();
    const commentCountMap = new Map<string, number>();
    const viewCountMap = new Map<string, number>();
    const clickCountMap = new Map<string, number>();

    reactionCounts.forEach(r => {
        if (r.type === 'LIKE' || !r.type) {
            const current = likeCountMap.get(r.likeable_id) || 0;
            likeCountMap.set(r.likeable_id, current + r._count._all);
        } else if (r.type === 'DISLIKE') {
            const current = dislikeCountMap.get(r.likeable_id) || 0;
            dislikeCountMap.set(r.likeable_id, current + r._count._all);
        }
    });

    interactionCounts.forEach(i => {
        if (i.type === 'VIEW') {
            const current = viewCountMap.get(i.trackable_id) || 0;
            viewCountMap.set(i.trackable_id, current + i._count._all);
        } else if (i.type === 'CLICK') {
            const current = clickCountMap.get(i.trackable_id) || 0;
            clickCountMap.set(i.trackable_id, current + i._count._all);
        }
    });

    commentCounts.forEach(c => {
        commentCountMap.set(c.commentable_id, c._count._all);
    });

    const userReactionMap = new Map<string, string>();
    userReactions.forEach(r => {
        userReactionMap.set(r.likeable_id, r.type);
    });

    const news = newsRaw.map(n => ({
        ...n,
        likes: likeCountMap.get(n.id) || 0,
        dislikes: dislikeCountMap.get(n.id) || 0,
        comments_count: commentCountMap.get(n.id) || 0,
        views_count: viewCountMap.get(n.id) || n.views_count || 0,
        clicks_count: clickCountMap.get(n.id) || n.clicks_count || 0,
        user_reaction: userReactionMap.get(n.id) || null
    }));

    return {
        news,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Get a single news article by slug
 * @param slug - Article slug
 * @returns News article
 */
export const getNewsBySlug = async (slug: string, userId?: string) => {
    const newsItem = await prisma.news.findUnique({
        where: { slug }
    });

    if (!newsItem) return null;

    // Fetch likes info
    const [counts, interactionCounts, userReaction, commentCount] = await Promise.all([
        prisma.like.groupBy({
            by: ['type'],
            where: {
                likeable_type: 'news',
                likeable_id: newsItem.id
            },
            _count: {
                _all: true
            }
        }),
        prisma.interaction.groupBy({
            by: ['type'],
            where: {
                trackable_type: 'news',
                trackable_id: newsItem.id
            },
            _count: {
                _all: true
            }
        }),
        userId ? prisma.like.findFirst({
            where: {
                user_id: userId,
                likeable_type: 'news',
                likeable_id: newsItem.id
            }
        }) : Promise.resolve(null),
        prisma.comment.count({
            where: {
                commentable_type: 'news',
                commentable_id: newsItem.id
            }
        })
    ]);

    let likes = 0;
    let dislikes = 0;
    let views = 0;
    let clicks = 0;

    counts.forEach(c => {
        if (c.type === 'LIKE') likes = c._count._all;
        if (c.type === 'DISLIKE') dislikes = c._count._all;
    });

    interactionCounts.forEach(i => {
        if (i.type === 'VIEW') views += i._count._all;
        if (i.type === 'CLICK') clicks += i._count._all;
    });

    return {
        ...newsItem,
        likes,
        dislikes,
        comments_count: commentCount,
        views_count: views > 0 ? views : (newsItem.views_count || 0),
        clicks_count: clicks > 0 ? clicks : (newsItem.clicks_count || 0),
        user_reaction: userReaction?.type || null
    };
};

/**
 * Update a news article
 * @param id - News ID
 * @param data - Update data
 * @returns Updated news article
 */
export const updateNews = async (id: string, data: Partial<NewsCreateInput>) => {
    return await prisma.news.update({
        where: { id },
        data
    });
};

/**
 * Delete a news article (and all related data)
 * @param id - News ID
 * @returns Deletion result
 */
export const deleteNews = async (id: string) => {
    const newsId = id;

    return await prisma.$transaction(async (tx) => {
        // Delete related data first
        await tx.comment.deleteMany({
            where: { commentable_id: newsId, commentable_type: 'news' }
        });

        await tx.like.deleteMany({
            where: { likeable_id: newsId, likeable_type: 'news' }
        });

        await tx.interaction.deleteMany({
            where: { trackable_id: newsId, trackable_type: 'news' }
        });

        return await tx.news.delete({
            where: { id: newsId }
        });
    });
};

import { trackInteraction } from "../tracking/tracking.service";

export const trackNewsInteraction = async (
    newsId: string,
    type: 'VIEW' | 'CLICK',
    userId?: string,
    fingerprint?: string
) => {
    return await trackInteraction(
        newsId,
        'news',
        type,
        userId,
        fingerprint
    );
};
