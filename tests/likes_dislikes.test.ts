
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { loginUser, createAuthHeaders } from "./helpers/auth";

const api = treaty(app);

describe("Like/Dislike System", () => {
    let authToken: Record<string, string>;
    let userId: string;
    let companyId: string;
    let jobId: string;

    beforeAll(async () => {
        try {
            // Create user and get token
            const tokens = await loginUser(app, 'jobSeeker');
            authToken = createAuthHeaders(tokens);
            userId = tokens.userId;

            // Create a company
            const company = await prisma.company.create({
                data: {
                    name: `Test Company ${Date.now()}`,
                    trustScore: 80,
                    totalRatings: 10
                }
            });
            companyId = company.id;

            // Create a job
            const job = await prisma.job.create({
                data: {
                    title: "Test Job for Dislikes",
                    description: "Description",
                    company: { connect: { id: companyId } },
                    location: "Milan",
                    salary_min: 30000,
                    salary_max: 40000,
                    seniority: "junior",
                    link: `https://test.com/job-dislike-${Date.now()}`
                }
            });
            jobId = job.id;
        } catch (e) {
            console.error("Setup failed:", e);
        }
    });

    afterAll(async () => {
        // Cleanup
        if (jobId) {
            await prisma.jobView.deleteMany({ where: { job_id: jobId } });
            await prisma.like.deleteMany({ where: { likeable_id: jobId } });
            await prisma.job.delete({ where: { id: jobId } });
        }
        if (companyId) await prisma.company.delete({ where: { id: companyId } });
        // User cleanup handled by helper or global teardown usually
    });

    it("should default to LIKE when creating a reaction without type", async () => {
        // Reset Company for this test
        await prisma.company.update({
            where: { id: companyId },
            data: { trustScore: 80, totalRatings: 10, totalLikes: 0, totalDislikes: 0 }
        });
        // Ensure no likes exist for this job/user
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });

        const { data, status } = await api.likes.post({ jobId }, { headers: authToken });
        expect(status).toBe(200);
        expect(data?.success).toBe(true);

        // Verify Trust Score increased
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        // (1 + 8) / (1 + 0 + 10) * 100 = 9/11 * 100 = 81.8181...
        expect(company?.trustScore).toBeCloseTo(81.8181, 2);
        expect(company?.totalRatings).toBe(11);
    });

    it("should create a DISLIKE reaction", async () => {
        // Reset Company
        await prisma.company.update({
            where: { id: companyId },
            data: { trustScore: 80, totalRatings: 10, totalLikes: 0, totalDislikes: 0 }
        });
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });

        const { data, status } = await api.likes.post({
            jobId,
            type: "DISLIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);

        // Verify Trust Score decreased
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        // (0 + 8) / (0 + 1 + 10) * 100 = 8/11 * 100 = 72.7272...
        expect(company?.trustScore).toBeCloseTo(72.7272, 2);
        expect(company?.totalRatings).toBe(11);
    });

    it("should swap DISLIKE to LIKE", async () => {
        // Prepare state: DISLIKE
        await prisma.company.update({
            where: { id: companyId },
            data: { trustScore: 72.7272, totalRatings: 11, totalLikes: 0, totalDislikes: 1 }
        });
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });
        await prisma.like.create({
            data: {
                user_id: userId,
                likeable_type: "job",
                likeable_id: jobId,
                type: "DISLIKE"
            }
        });

        const { data, status } = await api.likes.post({
            jobId,
            type: "LIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);

        // Verify Trust Score: (1 + 8) / (1 + 0 + 10) * 100 = 81.8181
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBeCloseTo(81.8181, 2);
        expect(company?.totalRatings).toBe(11);
    });

    it("should swap LIKE to DISLIKE", async () => {
        // Prepare state: LIKE
        await prisma.company.update({
            where: { id: companyId },
            data: { trustScore: 81.8181, totalRatings: 11, totalLikes: 1, totalDislikes: 0 }
        });
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });
        await prisma.like.create({
            data: {
                user_id: userId,
                likeable_type: "job",
                likeable_id: jobId,
                type: "LIKE"
            }
        });

        const { data, status } = await api.likes.post({
            jobId,
            type: "DISLIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);

        // Verify Trust Score: (0 + 8) / (0 + 1 + 10) * 100 = 72.7272
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBeCloseTo(72.7272, 2);
        expect(company?.totalRatings).toBe(11);
    });

    it("should remove DISLIKE", async () => {
        // Prepare state: DISLIKE
        await prisma.company.update({
            where: { id: companyId },
            data: { trustScore: 72.7272, totalRatings: 11, totalLikes: 0, totalDislikes: 1 }
        });
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });
        await prisma.like.create({
            data: {
                user_id: userId,
                likeable_type: "job",
                likeable_id: jobId,
                type: "DISLIKE"
            }
        });

        const { data, status } = await api.likes.delete(undefined, {
            query: { jobId },
            headers: authToken
        });

        expect(status).toBe(200);

        // Verify Trust Score: (0 + 8) / (0 + 0 + 10) * 100 = 80.0
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBe(80.0);
        expect(company?.totalRatings).toBe(10);
    });
    it("should ensure switching like type only affects current user", async () => {
        // Setup: Two users have reactions
        // User 1 (Current): LIKE
        // User 2 (Other): LIKE

        // 1. Create User 2
        const otherUser = await prisma.user.create({
            data: {
                email: `other.user.${Date.now()}@test.com`,
                password: "hashed_password",
                first_name: "Other",
                last_name: "User",
                role: "user"
            }
        });

        // 2. Setup initial state
        // Current User: LIKE
        await prisma.like.deleteMany({ where: { user_id: userId, likeable_id: jobId } });
        await prisma.like.create({
            data: { user_id: userId, likeable_type: "job", likeable_id: jobId, type: "LIKE" }
        });

        // Other User: LIKE
        await prisma.like.create({
            data: { user_id: otherUser.id, likeable_type: "job", likeable_id: jobId, type: "LIKE" }
        });

        // 3. Current User switches to DISLIKE
        const { status } = await api.likes.post({
            jobId,
            type: "DISLIKE"
        }, { headers: authToken });

        expect(status).toBe(200);

        // 4. Verify Final State

        // Current User should have DISLIKE
        const currentUserLike = await prisma.like.findFirst({
            where: { user_id: userId, likeable_id: jobId }
        });
        expect(currentUserLike?.type).toBe("DISLIKE");

        // Other User should still have LIKE (Unaffected)
        const otherUserLike = await prisma.like.findFirst({
            where: { user_id: otherUser.id, likeable_id: jobId }
        });
        expect(otherUserLike?.type).toBe("LIKE");

        // Verify counts via Prisma
        const likeCount = await prisma.like.count({ where: { likeable_id: jobId, type: "LIKE" } });
        const dislikeCount = await prisma.like.count({ where: { likeable_id: jobId, type: "DISLIKE" } });

        expect(likeCount).toBe(1); // 1 from Other User
        expect(dislikeCount).toBe(1); // 1 from Current User

        // 5. Verify counts via getJobById API (Detail Page Logic)
        const { data: jobResponse } = await api.jobs[jobId].get({ headers: authToken });
        expect(jobResponse?.success).toBe(true);
        expect(jobResponse?.data?.likes).toBe(1);
        expect(jobResponse?.data?.dislikes).toBe(1);

        // Cleanup User 2
        await prisma.like.deleteMany({ where: { user_id: otherUser.id } });
        await prisma.user.delete({ where: { id: otherUser.id } });
    });
});
