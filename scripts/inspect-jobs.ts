
import { prisma } from "../src/config/database";

async function inspectJobs() {
    console.log("Fetching first 5 jobs...");
    const jobs = await prisma.job.findMany({
        take: 5,
        select: {
            id: true,
            title: true,
            skills: true,
            technical_skills: true
        }
    });

    console.log(JSON.stringify(jobs, null, 2));
    await prisma.$disconnect();
}

inspectJobs();
