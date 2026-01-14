import { dbClient } from "../src/config/database";
import { hashPassword, comparePasswords } from "../src/utils/password";

async function seedE2E() {
    try {
        const password = "password123";
        const hashedPassword = await hashPassword(password);

        // 1. Create Admin
        const adminEmail = "admin@test.com";
        const existingAdmin = await dbClient.user.findUnique({ where: { email: adminEmail } });
        if (!existingAdmin) {
            await dbClient.user.create({
                data: {
                    email: adminEmail,
                    password: hashedPassword,
                    first_name: "Admin",
                    last_name: "User",
                    role: "ADMIN",
                },
            });
            console.log("Created admin@test.com");
        } else {
            await dbClient.user.update({
                where: { email: adminEmail },
                data: { password: hashedPassword, role: "ADMIN" }
            });
            console.log("Updated admin@test.com");
        }

        // 2. Create Seeker
        const seekerEmail = "seeker@test.com";
        const existingSeeker = await dbClient.user.findUnique({ where: { email: seekerEmail } });
        if (!existingSeeker) {
            await dbClient.user.create({
                data: {
                    email: seekerEmail,
                    password: hashedPassword,
                    first_name: "Job",
                    last_name: "Seeker",
                    role: "USER",
                },
            });
            console.log("Created seeker@test.com");
        } else {
            await dbClient.user.update({
                where: { email: seekerEmail },
                data: { password: hashedPassword, role: "USER" }
            });
            console.log("Updated seeker@test.com");
        }

        // Create Profiles
        const adminUser = await dbClient.user.findUnique({ where: { email: adminEmail } });
        if (adminUser) {
            const existingProfile = await dbClient.userProfile.findUnique({ where: { user_id: adminUser.id } });
            if (!existingProfile) {
                await dbClient.userProfile.create({
                    data: {
                        user_id: adminUser.id,
                        languages: ["it", "en"],
                        skills: ["Leadership"],
                        seniority: "Senior",
                        availability: "Immediate",
                        bio: "Admin Bio"
                    }
                });
                console.log("Created Admin Profile");
            }
        }

        const seekerUser = await dbClient.user.findUnique({ where: { email: seekerEmail } });
        if (seekerUser) {
            const existingProfile = await dbClient.userProfile.findUnique({ where: { user_id: seekerUser.id } });
            if (!existingProfile) {
                await dbClient.userProfile.create({
                    data: {
                        user_id: seekerUser.id,
                        languages: ["it", "en"],
                        skills: ["React", "Node.js"],
                        seniority: "Mid",
                        availability: "Immediate",
                        bio: "Seeker Bio"
                    }
                });
                console.log("Created Seeker Profile");
            }
        }


        // Verify password
        const savedSeeker = await dbClient.user.findUnique({ where: { email: seekerEmail } });
        const isMatch = await comparePasswords(password, savedSeeker?.password || "");
        console.log(`Password verification for seeker@test.com: ${isMatch ? "MATCH" : "FAIL"}`);

        console.log("E2E Seed completed successfully!");
    } catch (error) {
        console.error("Error seeding E2E users:", error);
        process.exit(1);
    } finally {
        await dbClient.$disconnect();
    }
}

seedE2E();
