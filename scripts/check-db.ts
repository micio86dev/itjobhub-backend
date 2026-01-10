import { dbClient } from "../src/config/database";

async function main() {
    try {
        const jobs = await dbClient.job.findMany({
            take: 5
        });
        console.log('Sample Jobs (Complete):', JSON.stringify(jobs, null, 2));

        const types = await dbClient.job.groupBy({
            by: ['employment_type'],
            _count: { _all: true }
        });
        console.log('Employment Types Grouped:', JSON.stringify(types, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await dbClient.$disconnect();
    }
}

main();
