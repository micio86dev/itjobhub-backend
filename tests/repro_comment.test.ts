
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { generateToken } from "../utils/auth";

const BASE_URL = "http://localhost:3001";

describe("Comment API Reproduction", () => {
    let authToken = "";
    let userId = "";
    let jobId = "";

    beforeAll(async () => {
        // Cleanup potentially stale data from previous failed runs
        try {
            const user = await prisma.user.findFirst({ where: { email: { startsWith: "repro_comment_" } } });
            if (user) {
                await prisma.refreshToken.deleteMany({ where: { user_id: user.id } });
                await prisma.userProfile.deleteMany({ where: { user_id: user.id } });
                await prisma.user.delete({ where: { id: user.id } });
            }
        } catch (e) {
            console.log("Pre-cleanup ignored", e);
        }
    });

    it("should successfully create a comment via API", async () => {
        // 1. Register a user
        const email = `repro_comment_${Date.now()}@test.com`;
        const registerRes = await app.handle(new Request(`${BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password: "password123",
                firstName: "Repro",
                lastName: "User"
            })
        }));

        const registerData = await registerRes.json();
        if (!registerData.success) {
            console.error("Register failed:", registerData);
        }
        expect(registerRes.status).toBe(201);

        authToken = registerData.data.token;
        userId = registerData.data.user.id;

        // 2. Create a job
        const job = await prisma.job.create({
            data: {
                title: "Test Job for Comments",
                description: "Description",
                company: { create: { name: "Test Corp" } },
                skills: ["Test"],
                seniority: "junior"
            }
        });
        jobId = job.id;

        // 3. Post a comment
        const commentRes = await app.handle(new Request(`${BASE_URL}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify({
                jobId: jobId,
                content: "This is a test comment"
            })
        }));

        const commentData = await commentRes.json();
        console.log("Comment Response:", JSON.stringify(commentData, null, 2));

        expect(commentRes.status).toBe(201);
        expect(commentData.success).toBe(true);
        expect(commentData.data.content).toBe("This is a test comment");

        // Cleanup - MUST delete relations first
        try {
            await prisma.comment.deleteMany({ where: { job_id: jobId } });
            await prisma.job.delete({ where: { id: jobId } });
            // Delete Refresh Tokens created during login/register
            await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
            // Delete UserProfile if created
            await prisma.userProfile.deleteMany({ where: { user_id: userId } });
            // Finally delete user
            await prisma.user.delete({ where: { id: userId } });
        } catch (e) {
            console.error("Cleanup failed:", e);
            throw e;
        }
    });
});
