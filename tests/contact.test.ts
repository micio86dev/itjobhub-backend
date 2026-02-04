import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("Contact Routes", () => {
    it("should send contact email successfully with valid data", async () => {
        const response = await app.handle(
            new Request("http://localhost/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "Test User",
                    email: "test@example.com",
                    subject: "collaboration",
                    message: "This is a test message for collaboration.",
                }),
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.message).toBe("Message sent successfully");
    });

    it("should fail validation with invalid email", async () => {
        const response = await app.handle(
            new Request("http://localhost/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "Test User",
                    email: "invalid-email",
                    subject: "collaboration",
                    message: "This is a test message.",
                }),
            })
        );

        expect(response.status).toBe(422);
        const body = await response.json();
        expect(body.success).toBe(false);
    });

    it("should fail validation with short message", async () => {
        const response = await app.handle(
            new Request("http://localhost/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "Test User",
                    email: "test@example.com",
                    subject: "collaboration",
                    message: "Short",
                }),
            })
        );

        expect(response.status).toBe(422);
    });

    it("should fail validation with invalid subject", async () => {
        const response = await app.handle(
            new Request("http://localhost/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "Test User",
                    email: "test@example.com",
                    subject: "invalid_subject",
                    message: "This is a valid message but subject is wrong.",
                }),
            })
        );

        expect(response.status).toBe(422);
    });
});
