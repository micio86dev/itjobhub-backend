
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { loginUser, createAuthHeaders } from "./helpers/auth";

const api = treaty(app);

describe("Like/Dislike System", () => {
    let authToken: any;
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
                    seniority: "junior"
                }
            });
            jobId = job.id;
        } catch (e) {
            console.error("Setup failed:", e);
        }
    });

    afterAll(async () => {
        // Cleanup
        if (jobId) await prisma.like.deleteMany({ where: { likeable_id: jobId } });
        if (jobId) await prisma.job.delete({ where: { id: jobId } });
        if (companyId) await prisma.company.delete({ where: { id: companyId } });
        // User cleanup handled by helper or global teardown usually
    });

    it("should default to LIKE when creating a reaction without type", async () => {
        const { data, status } = await api.likes.post({ jobId }, { headers: authToken });
        expect(status).toBe(200);
        expect(data?.success).toBe(true);
        // expect(data?.data.type).toBe("LIKE");

        // Verify Trust Score increased
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBe(80.1);
        expect(company?.totalRatings).toBe(11);

        // Cleanup
        await api.likes.delete(undefined, {
            query: { jobId },
            headers: authToken
        });
    });

    it("should create a DISLIKE reaction", async () => {
        // Reset Company Score
        await prisma.company.update({ where: { id: companyId }, data: { trustScore: 80, totalRatings: 10 } });

        const { data, status } = await api.likes.post({
            jobId,
            type: "DISLIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);
        // expect(data?.data.type).toBe("DISLIKE");

        // Verify Trust Score decreased
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        // 80 - 0.1 = 79.9
        expect(company?.trustScore).toBeCloseTo(79.9);
        expect(company?.totalRatings).toBe(11);
    });

    it("should swap DISLIKE to LIKE", async () => {
        // Existing state: DISLIKE, Score 79.9, Ratings 11

        const { data, status } = await api.likes.post({
            jobId,
            type: "LIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);
        // expect(data?.data.type).toBe("LIKE");

        // Verify Trust Score: 79.9 + 0.2 = 80.1
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBeCloseTo(80.1);
        expect(company?.totalRatings).toBe(11); // Ratings count shouldn't change on swap
    });

    it("should swap LIKE to DISLIKE", async () => {
        // Existing state: LIKE, Score 80.1, Ratings 11

        const { data, status } = await api.likes.post({
            jobId,
            type: "DISLIKE"
        }, { headers: authToken });

        expect(status).toBe(200);
        expect(data?.success).toBe(true);
        // expect(data?.data.type).toBe("DISLIKE");

        // Verify Trust Score: 80.1 - 0.2 = 79.9
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBeCloseTo(79.9);
        expect(company?.totalRatings).toBe(11);
    });

    it("should remove DISLIKE", async () => {
        // Existing state: DISLIKE, Score 79.9, Ratings 11

        const { data, status } = await api.likes.delete(undefined, {
            query: { jobId },
            headers: authToken
        });

        expect(status).toBe(200);
        expect(data?.message).toBe("Unliked successfully"); // Message might say "Like" generic

        // Verify Trust Score: 79.9 + 0.1 = 80.0
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        expect(company?.trustScore).toBeCloseTo(80);
        expect(company?.totalRatings).toBe(10);
    });
});
