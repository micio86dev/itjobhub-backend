
import { PrismaClient } from '@prisma/client';
import logger from "../utils/logger";

const prisma = new PrismaClient();

async function main() {
    const jobCount = await prisma.job.count();
    const jobs = await prisma.job.findMany({
        take: 5,
        include: { company: true }
    });

    logger.info(`Total jobs: ${jobCount}`);
    jobs.forEach(j => {
        logger.info(`- ${j.title} @ ${j.company?.name} (Status: ${j.status})`);
    });

    const userCount = await prisma.user.count();
    logger.info(`Total users: ${userCount}`);
}

main()
    .catch((e) => logger.error(e))
    .finally(() => prisma.$disconnect());
