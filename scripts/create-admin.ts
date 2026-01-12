import { dbClient } from "../src/config/database";
import { hashPassword } from "../src/utils/password";

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
            console.log(`Admin user with email ${email} already exists.`);
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

        console.log("Admin user created successfully!");
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
    } catch (error) {
        console.error("Error creating admin user:", error);
    } finally {
        await dbClient.$disconnect();
    }
}

createAdmin();
