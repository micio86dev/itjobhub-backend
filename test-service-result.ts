import { getJobById } from "./src/services/jobs/job.service";
import { prisma } from "./src/config/database";
import logger from "./src/utils/logger";

async function test() {
    const job = await prisma.job.findFirst();
    if (!job) return;

    logger.info("Testing service for job: " + job.id);
    const result = await getJobById(job.id);
    logger.info("Views count in service result: " + result?.views_count);
}

test()
    .catch(err => logger.error({ err }, "Error in test-service-result"))
    .finally(() => prisma.$disconnect());
