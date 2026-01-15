import { dbClient } from "./src/config/database";
import logger from "./src/utils/logger";

async function main() {
    try {
        await dbClient.$connect();
        const count = await dbClient.job.count();
        logger.info("Job count: " + count);
        const localhostJobs = await dbClient.job.findMany({
            where: {
                link: { contains: 'localhost' }
            },
            take: 10,
            select: { title: true, link: true, source: true }
        });
        logger.info("Localhost jobs: " + JSON.stringify(localhostJobs, null, 2));
    } catch (err) {
        logger.error({ err }, "Error checking db");
    } finally {
        await dbClient.$disconnect();
    }
}

main();
