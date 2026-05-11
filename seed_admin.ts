/**
 * seed_admin.ts
 *
 * Idempotently ensures the dashboard admin account exists with the password
 * provided via env. Designed to run in the migrations container on every deploy.
 *
 * Required env (injected from GitHub Secrets via the server .env):
 *   ADMIN_EMAIL    - admin login email
 *   ADMIN_PASSWORD - admin plaintext password (hashed here with bcrypt)
 *
 * If either is missing the script logs and exits 0 (no-op) so it never blocks
 * a deploy when the secrets aren't configured yet.
 *
 * Run: bun run seed_admin.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("ℹ️  ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { password: hashedPassword, role: "admin" },
    create: {
      email,
      password: hashedPassword,
      first_name: "Admin",
      last_name: "User",
      role: "admin",
    },
  });
  console.log(`✅ Admin user ensured: ${admin.email} (role=${admin.role})`);

  await prisma.userProfile.upsert({
    where: { user_id: admin.id },
    update: {},
    create: {
      user_id: admin.id,
      bio: "Platform administrator.",
      languages: [],
      skills: [],
      workModes: [],
    },
  });
  console.log("✅ Admin profile ensured");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding admin:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
