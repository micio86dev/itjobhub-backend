import { getJobById } from "./src/services/jobs/job.service";
import { prisma } from "./src/config/database";

async function test() {
    const job = await prisma.job.findFirst();
    if (!job) return;

    console.log("Testing service for job:", job.id);
    const result = await getJobById(job.id);
    console.log("Views count in service result:", result?.views_count);
}

test()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
