
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

async function main() {
    const email = "admin_official@itjobhub.com";
    // Password explicitly requested by user
    const password = "12345Abc$";

    console.log(`Hashing password for ${email}...`);
    const hashedPassword = await hashPassword(password);

    console.log(`Upserting user ${email}...`);
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: "admin",
        },
        create: {
            email,
            password: hashedPassword,
            first_name: "Admin",
            last_name: "Official",
            role: "admin",
        },
    });

    console.log(`Successfully ensured admin user:`);
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
}

main()
    .catch((e) => {
        console.error("Error ensuring admin user:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
