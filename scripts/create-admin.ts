import { dbClient } from "../src/config/database";
import { hashPassword } from "../src/utils/password";
import logger from "../src/utils/logger";

async function createAdmin() {
    const email = process.env.ADMIN_EMAIL || "admin@itjobhub.com";
    const password = process.env.ADMIN_PASSWORD || "AdminPassword123!"; // You should change this on first login
    const firstName = "Admin";
    const lastName = "User";

    try {
        const existingUser = await dbClient.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            logger.info(`Admin user with email ${email} already exists.`);
            process.exit(0);
        }

        const hashedPassword = await hashPassword(password);

        await dbClient.user.create({
            data: {
                email,
                password: hashedPassword,
                first_name: firstName,
                last_name: lastName,
                role: "admin",
            },
        });

        logger.info("Admin user created successfully!");
        logger.info(`Email: ${email}`);
        logger.info(`Password: ${password}`);
    } catch (error) {
        logger.error({ err: error }, "Error creating admin user");
    } finally {
        await dbClient.$disconnect();
    }
}

createAdmin();
