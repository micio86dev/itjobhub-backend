import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function test() {
  try {
    const users = await prisma.user.findMany();
    console.log("✅ Prisma connected, users:", users);
  } catch (err) {
    console.error("❌ Prisma connection failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
