
import { getTopSkills } from "../src/services/jobs/job.service";
import { prisma } from "../src/config/database";

async function testService() {
    console.log("Testing getTopSkills service...");
    const skills = await getTopSkills(5);
    console.log("Top 5 Skills:", skills);
    await prisma.$disconnect();
}

testService();
