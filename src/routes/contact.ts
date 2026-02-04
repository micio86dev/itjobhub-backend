import { Elysia, t } from "elysia";
import { sendEmail, renderEmailLayout } from "../services/email/email.service";
import logger from "../utils/logger";
import { translate } from "../i18n";
import { authMiddleware } from "../middleware/auth";
import { getUserById } from "../services/users/user.service";

export const contactRoutes = new Elysia({ prefix: "/contact" })
    .use(authMiddleware)
    .post(
        "/",
        async ({ body, user, request, set }) => {
            let { name, email } = body;
            const { type, message } = body;
            const acceptLanguage = request.headers.get("accept-language");
            const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";

            if (user) {
                // Authenticated user
                if (!email) email = user.email;
                if (!name) {
                    const userData = await getUserById(user.id);
                    if (userData) {
                        name = `${userData.first_name} ${userData.last_name}`.trim();
                    }
                    if (!name) name = user.email; // Fallback to email if name is still empty
                }
            } else {
                // Anonymous user - manual validation since schema is optional
                if (!name || name.trim().length < 2) {
                    set.status = 400;
                    return { success: false, message: translate("validation.error", lang) };
                }
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    set.status = 400;
                    return { success: false, message: translate("validation.error", lang) };
                }
            }

            const contactEmail = process.env.CONTACT_EMAIL || "micio86dev@gmail.com";

            // Determine subject and email content based on type
            let subjectStr = "";
            let typeLabel = "";

            switch (type) {
                case "error":
                    subjectStr = translate("email.subject.error_report", lang);
                    typeLabel = translate("contact.type.error", lang);
                    break;
                case "participation":
                    subjectStr = translate("email.subject.participation_request", lang);
                    typeLabel = translate("contact.type.participation", lang);
                    break;
                case "other":
                    subjectStr = translate("email.subject.other_request", lang);
                    typeLabel = translate("contact.type.other", lang);
                    break;
                default:
                    subjectStr = translate("email.subject.general_contact", lang);
                    typeLabel = translate("contact.type.general", lang);
            }

            const content = `
                <h2>${subjectStr}</h2>
                <div style="margin-bottom: 24px;">
                    <p><strong>${translate("contact.name", lang)}:</strong> ${name}</p>
                    <p><strong>${translate("contact.email", lang)}:</strong> ${email}</p>
                    <p><strong>${translate("contact.type", lang)}:</strong> ${typeLabel}</p>
                </div>
                <div style="background-color: #0d1117; border: 1px solid #30363d; padding: 20px; border-radius: 4px;">
                    <p style="margin-top: 0; color: #8b949e; font-size: 12px; text-transform: uppercase;">Message:</p>
                    <p style="white-space: pre-wrap; margin-bottom: 0;">${message}</p>
                </div>
            `;

            const html = renderEmailLayout({
                subject: subjectStr,
                content,
                footer: `<p>Sent from DevBoards.io Contact Form</p>`
            });

            try {
                await sendEmail({
                    to: contactEmail,
                    subject: `${subjectStr} - ${name}`,
                    html,
                });

                return {
                    success: true,
                    message: translate("contact.success_message", lang),
                };
            } catch (error) {
                logger.error({ error }, "Failed to send contact email");
                set.status = 500;
                return {
                    success: false,
                    message: translate("contact.error_message", lang),
                };
            }
        },
        {
            body: t.Object({
                name: t.Optional(t.String()),
                email: t.Optional(t.String()),
                type: t.Union([
                    t.Literal("general"),
                    t.Literal("error"),
                    t.Literal("participation"),
                    t.Literal("other"),
                ]),
                message: t.String({ minLength: 10 }),
            }),
            detail: {
                tags: ["contact"],
                summary: "Send a contact email",
            },
        }
    );
