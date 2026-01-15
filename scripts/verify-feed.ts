
import { getJobs } from "../src/services/jobs/job.service";
import { prisma } from "../src/config/database";
import logger from "../src/utils/logger";

async function verifyFilters() {
    logger.info("--- Verifying Personalized Feed Filters ---");

    // 1. Test Skills Filter
    logger.info("\n1. Testing Skills Filter (Java)...");
    const javaJobs = await getJobs(1, 5, { skills: ["Java"] });
    logger.info(`Found ${javaJobs.pagination.total} jobs with Java.`);

    // 2. Test Seniority Filter
    logger.info("\n2. Testing Seniority Filter (Senior)...");
    const seniorJobs = await getJobs(1, 5, { seniority: "Senior" });
    logger.info(`Found ${seniorJobs.pagination.total} Senior jobs.`);

    // 3. Test Intersection (Java AND Senior)
    logger.info("\n3. Testing Intersection (Java AND Senior)...");
    const javaSeniorJobs = await getJobs(1, 5, { skills: ["Java"], seniority: "Senior" });
    logger.info(`Found ${javaSeniorJobs.pagination.total} Senior Java jobs.`);

    if (javaSeniorJobs.pagination.total <= javaJobs.pagination.total &&
        javaSeniorJobs.pagination.total <= seniorJobs.pagination.total) {
        logger.info("SUCCESS: Intersection logic seems correct (Access <= Individual).");
    } else {
        logger.error("FAILURE: Intersection count is higher than individual counts!");
    }

    // 4. Test Date Range (Yesterday - Today)
    // IMPORTANT: Since we don't know the exact dates of jobs in DB, we just verify it runs without error 
    // and returns subset or empty.
    logger.info("\n4. Testing Date Range (Today)...");
    const newJobs = await getJobs(1, 5, { dateRange: 'today' });
    logger.info(`Found ${newJobs.pagination.total} jobs published today.`);

    await prisma.$disconnect();
}

verifyFilters();
