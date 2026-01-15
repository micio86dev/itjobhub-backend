
import { prisma } from "../src/config/database";
import logger from "../src/utils/logger";

async function test() {
    try {
        const user = await prisma.user.findFirst();
        const job = await prisma.job.findFirst();

        if (!user || !job) {
            logger.info("Need at least one user and one job to test");
            return;
        }

        logger.info(`Testing comment insertion for user ${user.id} and job ${job.id}`);

        const comment = await prisma.comment.create({
            data: {
                content: "Manual test comment " + Date.now(),
                user: { connect: { id: user.id } },
                job: { connect: { id: job.id } },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true
                    }
                }
            }
        });

        logger.info({ comment }, "Successfully created comment via Prisma");

        // Now test via fetch if the server is running (optional, but let's just test Prisma first)
    } catch (error) {
        logger.error({ err: error }, "Failed to insert comment");
    } finally {
        await prisma.$disconnect();
    }
}

test();
