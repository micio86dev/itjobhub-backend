
import { getStatistics } from '../src/services/admin/admin.service';
import { prisma } from '../src/config/database';
import logger from "../src/utils/logger";

async function verify() {
    logger.info("Fetching stats...");
    try {
        const stats = await getStatistics();
        const locations = stats.charts.locations;
        logger.info(`Found ${locations?.length} locations.`);
        if (locations && locations.length > 0) {
            logger.info({ location: locations[0] }, "Sample Location");
        }
    } catch (e) {
        logger.error(e);
    }
    await prisma.$disconnect();
}
verify();
