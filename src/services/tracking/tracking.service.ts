import { prisma as dbClient } from "../../config/database";
import { Prisma } from '@prisma/client';
import logger from "../../utils/logger";

export type TrackableType = 'job' | 'news';
export type InteractionType = 'VIEW' | 'CLICK' | 'APPLY';

export const trackInteraction = async (
    trackableId: string,
    trackableType: TrackableType,
    type: InteractionType,
    userId?: string,
    fingerprint?: string
) => {
    if (!userId && !fingerprint) return;

    try {
        const viewData = {
            trackable_id: trackableId,
            trackable_type: trackableType,
            type,
            user_id: userId || null,
            fingerprint: (!userId && fingerprint) ? fingerprint : null
        };

        // Check if already tracked (prevent abuse/duplicate counts for same user/session)
        const existing = await dbClient.interaction.findFirst({
            where: viewData
        });

        if (existing) {
            return { success: false, reason: 'already_tracked' };
        }

        try {
            await dbClient.interaction.create({
                data: viewData
            });

            // Update counters on the entity document (denormalized)
            let updateData = {};

            if (type === 'VIEW') {
                updateData = { views_count: { increment: 1 } };
            } else if (type === 'CLICK' || type === 'APPLY') {
                updateData = { clicks_count: { increment: 1 } };
            }

            if (trackableType === 'job') {
                await dbClient.job.update({
                    where: { id: trackableId },
                    data: updateData
                });
            } else if (trackableType === 'news') {
                await dbClient.news.update({
                    where: { id: trackableId },
                    data: updateData
                });
            }

            return { success: true };
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return { success: false, reason: 'already_tracked' };
            }
            logger.error({ error, trackableId, trackableType, type }, `[TrackingService] Error tracking ${type} for ${trackableType} ${trackableId}`);
            throw error;
        }
    } catch (error) {
        logger.error({ error }, '[TrackingService] trackInteraction failed');
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
};
