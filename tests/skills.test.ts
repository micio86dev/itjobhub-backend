import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { dbClient } from "../src/config/database";
import { loginUser } from "./helpers/auth";

import { testUsers } from "./helpers/test-data";

const TEST_EMAIL = testUsers.jobSeeker.email;
let authHeaders: { Authorization: string; "Content-Type": string };
let userId: string;

describe("Skills API", () => {
    beforeAll(async () => {
        // Clean up before starting
        await dbClient.user.deleteMany({ where: { email: TEST_EMAIL } });
        await dbClient.userProfile.deleteMany({ where: { user: { email: TEST_EMAIL } } });

        // Use loginUser to create/get user and token
        const tokens = await loginUser(app, 'jobSeeker');
        userId = tokens.userId;
        authHeaders = {
            Authorization: `Bearer ${tokens.token}`,
            "Content-Type": "application/json"
        };
    });

    afterAll(async () => {
        if (userId) {
            await dbClient.userProfile.update({
                where: { user_id: userId },
                data: { skills: [] } // Reset skills
            });
        }
    });

    it("should return 401 if not authenticated", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skill: "Python" })
            })
        );
        expect(res.status).toBe(401);
    });

    it("should add a new skill to user profile", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ skill: "Python" })
            })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.skills).toContain("Python");
    });

    it("should not duplicate existing skill", async () => {
        // Add same skill again
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ skill: "Python" })
            })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        const skills = body.data.skills as string[];
        const pythonCount = skills.filter(s => s === "Python").length;
        expect(pythonCount).toBe(1);
    });

    it("should add a second different skill", async () => {
        const res = await app.handle(
            new Request("http://localhost/users/me/skills", {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ skill: "Rust" })
            })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.skills).toContain("Python");
        expect(body.data.skills).toContain("Rust");
        expect(body.data.skills.length).toBeGreaterThanOrEqual(2);
    });
});
