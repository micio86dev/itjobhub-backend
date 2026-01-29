import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const adminEmail = "admin@test.com";
    const seekerEmail = "seeker@test.com";
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, 12);

    console.log("🌱 Seeding test users...");

    // Create admin
    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password: hashedPassword,
            role: "admin",
        },
        create: {
            email: adminEmail,
            password: hashedPassword,
            first_name: "Admin",
            last_name: "Test",
            role: "admin",
        },
    });
    console.log("✅ Admin user created/updated:", admin.email);

    // Create admin profile
    await prisma.userProfile.upsert({
        where: { user_id: admin.id },
        update: {},
        create: {
            user_id: admin.id,
            bio: "I am the administrator.",
            location: "Milan",
            skills: ["Admin", "Security"],
            languages: ["Italian", "English"],
            seniority: "senior",
            availability: "full-time",
            workModes: ["office", "remote"]
        }
    });
    console.log("✅ Admin profile created/updated");

    // Create seeker
    const seeker = await prisma.user.upsert({
        where: { email: seekerEmail },
        update: {
            password: hashedPassword,
            role: "user",
        },
        create: {
            email: seekerEmail,
            password: hashedPassword,
            first_name: "Seeker",
            last_name: "Test",
            role: "user",
        },
    });
    console.log("✅ Seeker user created/updated:", seeker.email);

    // Create seeker profile
    await prisma.userProfile.upsert({
        where: { user_id: seeker.id },
        update: {
            bio: "I am a skilled developer looking for a job.",
            location: "Rome",
            skills: ["JavaScript", "TypeScript", "React", "Qwik"],
            languages: ["Italian", "English"],
            seniority: "mid",
            availability: "full-time",
            workModes: ["remote", "hybrid"]
        },
        create: {
            user_id: seeker.id,
            bio: "I am a skilled developer looking for a job.",
            location: "Rome",
            skills: ["JavaScript", "TypeScript", "React", "Qwik"],
            languages: ["Italian", "English"],
            seniority: "mid",
            availability: "full-time",
            workModes: ["remote", "hybrid"]
        }
    });
    console.log("✅ Seeker profile created/updated");
}

main()
    .catch((e) => {
        console.error("❌ Error seeding users:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
