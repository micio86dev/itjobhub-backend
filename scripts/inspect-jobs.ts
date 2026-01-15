
import { prisma } from "../src/config/database";
import logger from "../src/utils/logger";

async function inspectJobs() {
    logger.info("Fetching first 5 jobs...");
    const jobs = await prisma.job.findMany({
        take: 5,
        select: {
            id: true,
            title: true,
            skills: true,
            technical_skills: true
        }
    });

    logger.info(JSON.stringify(jobs, null, 2));
    await prisma.$disconnect();
}

inspectJobs();
