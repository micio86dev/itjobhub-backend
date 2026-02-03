
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { loginUser, createAuthHeaders } from "./helpers/auth";
import logger from "../src/utils/logger";

const api = treaty(app);

describe("News System", () => {
    let adminAuth: Record<string, string>;
    let userAuth: Record<string, string>;
    let newsId: string;

    beforeAll(async () => {
        try {
            // Login as admin (loginUser handles creation/role update if needed)
            const adminTokens = await loginUser(app, 'admin');
            adminAuth = createAuthHeaders(adminTokens);

            // Login as regular user
            const userTokens = await loginUser(app, 'jobSeeker');
            userAuth = createAuthHeaders(userTokens);

        } catch (e) {
            logger.error({ e }, "Setup failed");
            throw e;
        }
    });

    afterAll(async () => {
        if (newsId) {
            // Clean up related data first if needed, though deleteNews service handles it.
            // But here we are deleting manually or relying on API?
            // The last test deletes the news via API. If it fails, we might leave garbage.
            // Let's try to delete just in case.
            await prisma.news.deleteMany({ where: { id: newsId } });
        }
    });

    it("should allow admin to create news", async () => {
        const { data, status } = await api.news.post({
            title: "Test News Article",
            slug: `test-news-${Date.now()}`,
            summary: "This is a summary",
            content: "This is the content",
            language: "en",
            category: "Tech"
        }, { headers: adminAuth });

        if (status !== 200) {
            console.error("Create News Error:", data);
        }

        expect(status).toBe(200);
        expect(data?.success).toBe(true);
        expect(data?.data?.id).toBeDefined();
        newsId = data?.data?.id!;
    });

    it("should get news list", async () => {
        const { data, status } = await api.news.get({ query: { limit: '10' } });
        expect(status).toBe(200);
        expect(data?.data?.news).toBeArray();
        const found = data?.data?.news.find(n => n.id === newsId);
        expect(found).toBeDefined();
    });

    it("should get news by slug", async () => {
        // First get the slug to be sure
        const news = await prisma.news.findUnique({ where: { id: newsId } });

        const { data, status } = await api.news({ id: news!.slug }).get();
        expect(status).toBe(200);
        expect(data?.data?.id).toBe(newsId);
    });

    it("should track view interaction", async () => {
        const { data, status } = await api.news({ id: newsId }).track.post({
            type: 'VIEW'
        }, { headers: userAuth });

        expect(status).toBe(200);
    });

    it("should allow admin to delete news", async () => {
        const { status } = await api.news({ id: newsId }).delete(undefined, { headers: adminAuth });
        expect(status).toBe(200);

        // Verify deletion
        const check = await prisma.news.findUnique({ where: { id: newsId } });
        expect(check).toBeNull();
    });
});
