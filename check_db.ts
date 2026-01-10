import { dbClient } from "./src/config/database";

async function main() {
    try {
        await dbClient.$connect();
        const count = await dbClient.job.count();
        console.log("Job count:", count);
        const localhostJobs = await dbClient.job.findMany({
            where: {
                link: { contains: 'localhost' }
            },
            take: 10,
            select: { title: true, link: true, source: true }
        });
        console.log("Localhost jobs:", JSON.stringify(localhostJobs, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await dbClient.$disconnect();
    }
}

main();
