
import { prisma } from "../src/config/database";

async function test() {
    try {
        const user = await prisma.user.findFirst();
        const job = await prisma.job.findFirst();

        if (!user || !job) {
            console.log("Need at least one user and one job to test");
            return;
        }

        console.log(`Testing comment insertion for user ${user.id} and job ${job.id}`);

        const comment = await prisma.comment.create({
            data: {
                content: "Manual test comment " + Date.now(),
                user: { connect: { id: user.id } },
                job: { connect: { id: job.id } },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true
                    }
                }
            }
        });

        console.log("Successfully created comment via Prisma:", comment);

        // Now test via fetch if the server is running (optional, but let's just test Prisma first)
    } catch (error) {
        console.error("Failed to insert comment:", error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
