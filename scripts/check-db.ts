import { dbClient } from "../src/config/database";
import logger from "../src/utils/logger";

async function main() {
    try {
        const jobs = await dbClient.job.findMany({
            take: 5
        });
        logger.info('Sample Jobs (Complete): ' + JSON.stringify(jobs, null, 2));

        const types = await dbClient.job.groupBy({
            by: ['employment_type'],
            _count: { _all: true }
        });
        logger.info('Employment Types Grouped: ' + JSON.stringify(types, null, 2));
    } catch (e) {
        logger.error(e);
    } finally {
        await dbClient.$disconnect();
    }
}

main();
