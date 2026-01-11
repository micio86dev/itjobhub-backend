
import { prisma } from "../src/config/database";

async function verifyStats() {
    console.log("Fetching all jobs...");
    const jobs = await prisma.job.findMany({
        select: {
            skills: true,
            technical_skills: true,
            employment_type: true
        }
    });

    console.log(`Found ${jobs.length} jobs.`);

    // --- Verify Skills ---
    const skillCounts: Record<string, number> = {};
    jobs.forEach(job => {
        const process = (arr: string[]) => {
            if (Array.isArray(arr)) {
                arr.forEach(s => {
                    if (typeof s === 'string' && s.trim()) {
                        const key = s.trim();
                        skillCounts[key] = (skillCounts[key] || 0) + 1;
                    }
                });
            }
        };
        process(job.skills);
        process(job.technical_skills);
    });

    const topSkills = Object.entries(skillCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    console.log("\n--- Top 10 Skills (Revised) ---");
    topSkills.forEach((s, i) => console.log(`${i + 1}. ${s.label}: ${s.value}`));

    // --- Verify Employment Type ---
    const empCounts: Record<string, number> = {};
    jobs.forEach(job => {
        const type = job.employment_type || 'Unknown/Null';
        empCounts[type] = (empCounts[type] || 0) + 1;
    });

    const topEmp = Object.entries(empCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

    console.log("\n--- Employment Types ---");
    topEmp.forEach((s, i) => console.log(`${i + 1}. ${s.label}: ${s.value}`));

    await prisma.$disconnect();
}

verifyStats();
