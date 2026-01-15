import { dbClient } from "../src/config/database";
import { hashPassword, comparePasswords } from "../src/utils/password";
import logger from "../src/utils/logger";

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
                    role: "admin",
                },
            });
            logger.info("Created admin@test.com");
        } else {
            await dbClient.user.update({
                where: { email: adminEmail },
                data: { password: hashedPassword, role: "admin" }
            });
            logger.info("Updated admin@test.com");
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
                    role: "user",
                },
            });
            logger.info("Created seeker@test.com");
        } else {
            await dbClient.user.update({
                where: { email: seekerEmail },
                data: { password: hashedPassword, role: "user" }
            });
            logger.info("Updated seeker@test.com");
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
                logger.info("Created Admin Profile");
            } else {
                await dbClient.userProfile.update({
                    where: { id: existingProfile.id },
                    data: {
                        languages: ["it", "en"],
                        skills: ["Leadership"],
                        seniority: "Senior",
                        availability: "Immediate",
                        bio: "Admin Bio"
                    }
                });
                logger.info("Updated Admin Profile");
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
                logger.info("Created Seeker Profile");
            } else {
                await dbClient.userProfile.update({
                    where: { id: existingProfile.id },
                    data: {
                        languages: ["it", "en"],
                        skills: ["React", "Node.js"],
                        seniority: "Mid",
                        availability: "Immediate",
                        bio: "Seeker Bio"
                    }
                });
                logger.info("Updated Seeker Profile");
            }
        }



        // 4. Create Company and Job
        let companyId;
        const companyName = "E2E Tech Corp";
        const existingCompany = await dbClient.company.findFirst({ where: { name: companyName } });

        if (!existingCompany) {
            const company = await dbClient.company.create({
                data: {
                    name: companyName,
                    description: "A great company for E2E testing",
                    location: "Milan, Italy",
                    trustScore: 95.0,
                    logo_url: "https://via.placeholder.com/150"
                }
            });
            companyId = company.id;
            logger.info("Created Company: " + companyName);
        } else {
            companyId = existingCompany.id;
            logger.info("Found Company: " + companyName);
        }

        const jobTitle = "E2E Software Engineer";
        const existingJob = await dbClient.job.findFirst({
            where: {
                title: jobTitle,
                company_id: companyId
            }
        });

        if (!existingJob) {
            await dbClient.job.create({
                data: {
                    title: jobTitle,
                    description: "<h1>Job Description</h1><p>This is a test job.</p>",
                    company_id: companyId,
                    link: "https://example.com/e2e-job-" + Date.now(),
                    location: "Milan",
                    remote: true,
                    status: "active",
                    employment_type: "Full-time",
                    seniority: "Mid-Senior",
                    published_at: new Date(),
                    salary_min: 50000,
                    salary_max: 80000,
                    skills: ["Playwright", "TypeScript"],
                    requirements: ["Experience with E2E testing"],
                    benefits: ["Remote work"]
                }
            });
            logger.info("Created Job: " + jobTitle);
        } else {
            logger.info("Found Job: " + jobTitle);
        }

        // Verify password
        const savedSeeker = await dbClient.user.findUnique({ where: { email: seekerEmail } });
        const isMatch = await comparePasswords(password, savedSeeker?.password || "");
        logger.info(`Password verification for seeker@test.com: ${isMatch ? "MATCH" : "FAIL"}`);

        logger.info("E2E Seed completed successfully!");
    } catch (error) {
        logger.error({ err: error }, "Error seeding E2E users");
        process.exit(1);
    } finally {
        await dbClient.$disconnect();
    }
}

seedE2E();
