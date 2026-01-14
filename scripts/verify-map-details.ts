
import { getStatistics } from '../src/services/admin/admin.service';
import { prisma } from '../src/config/database';

async function verify() {
    console.log("Fetching stats...");
    try {
        const stats = await getStatistics();
        const locations = stats.charts.locations;
        console.log(`Found ${locations?.length} locations.`);
        if (locations && locations.length > 0) {
            console.log("Sample Location:", locations[0]);
        }
    } catch (e) {
        console.error(e);
    }
    await prisma.$disconnect();
}
verify();
