import { Elysia, t } from "elysia";
import { sendContactEmail } from "../services/email/email.service";
import logger from "../utils/logger";

export const contactRoutes = new Elysia({ prefix: "/contact" })
    .post("/", async ({ body, set }) => {
        try {
            await sendContactEmail({
                name: body.name,
                email: body.email,
                subject: body.subject,
                message: body.message,
            });

            return {
                success: true,
                message: "Message sent successfully",
            };
        } catch (error) {
            logger.error({ err: error }, "Failed to send contact email");
            set.status = 500;
            return {
                success: false,
                message: "Failed to send message. Please try again later.",
            };
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 2, maxLength: 100 }),
            email: t.String({ format: "email" }),
            subject: t.Union([
                t.Literal("error_report"),
                t.Literal("collaboration"),
                t.Literal("other")
            ]),
            message: t.String({ minLength: 10, maxLength: 1000 }),
        })
    });
