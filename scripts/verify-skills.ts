
import { prisma } from "../src/config/database";

async function verifySkills() {
    console.log("Fetching all jobs...");
    const jobs = await prisma.job.findMany({
        select: { skills: true }
    });

    console.log(`Found ${jobs.length} jobs.`);

    const skillCounts: Record<string, number> = {};
    jobs.forEach(job => {
        if (Array.isArray(job.skills)) {
            job.skills.forEach((skill: any) => {
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

    console.log("Top 20 Skills:");
    topSkills.forEach((s, i) => {
        console.log(`${i + 1}. ${s.label}: ${s.value}`);
    });

    await prisma.$disconnect();
}

verifySkills();
