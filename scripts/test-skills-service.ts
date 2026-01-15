
import { getTopSkills } from "../src/services/jobs/job.service";
import { prisma } from "../src/config/database";
import logger from "../src/utils/logger";

async function testService() {
    logger.info("Testing getTopSkills service...");
    const skills = await getTopSkills(5);
    logger.info({ skills }, "Top 5 Skills");
    await prisma.$disconnect();
}

testService();
