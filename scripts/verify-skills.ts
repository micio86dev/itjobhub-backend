
import { prisma } from "../src/config/database";
import logger from "../src/utils/logger";

async function verifySkills() {
    logger.info("Fetching all jobs...");
    const jobs = await prisma.job.findMany({
        select: { skills: true }
    });

    logger.info(`Found ${jobs.length} jobs.`);

    const skillCounts: Record<string, number> = {};
    jobs.forEach(job => {
        if (Array.isArray(job.skills)) {
            job.skills.forEach((skill) => {
                if (typeof skill === 'string') {
                    const normalizedSkill = skill.trim();
                    if (normalizedSkill) {
                        skillCounts[normalizedSkill] = (skillCounts[normalizedSkill] || 0) + 1;
                    }
                }
            });
        }
    });

    const topSkills = Object.entries(skillCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 20);

    logger.info("Top 20 Skills:");
    topSkills.forEach((s, i) => {
        logger.info(`${i + 1}. ${s.label}: ${s.value}`);
    });

    await prisma.$disconnect();
}

verifySkills();
