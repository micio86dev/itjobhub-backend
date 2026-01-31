
import FormData from "form-data";
import Mailgun from "mailgun.js";
import logger from "../../utils/logger";

const mailgun = new Mailgun(FormData);

// Initialize Mailgun client
// We use a getter to ensure env vars are loaded when needed
const getMgClient = () => {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  const isPlaceholder = (val?: string) => !val || val.startsWith("your-") || val.includes("placeholder");

  if (isPlaceholder(apiKey) || isPlaceholder(domain)) {
    logger.warn("Mailgun credentials missing or invalid (placeholder detected). Email sending will be skipped/mocked.");
    return null;
  }

  return mailgun.client({
    username: "api",
    key: apiKey,
  });
};

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: EmailOptions) => {
  const mg = getMgClient();
  const from = process.env.MAILGUN_FROM_EMAIL || "DevBoards.io <noreply@itjobhub.com>";
  const domain = process.env.MAILGUN_DOMAIN || "";

  if (!mg) {
    logger.info(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
    return;
  }

  try {
    await mg.messages.create(domain, {
      from,
      to: [to],
      subject,
      html,
    });
    logger.info(`Email sent to ${to}`);
  } catch (error) {
    logger.error({ error }, "Error sending email");
    throw new Error("Failed to send email");
  }
};

export const sendForgotPasswordEmail = async (to: string, resetLink: string) => {
  const subject = "Reset Your Password - DevBoards.io";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: sans-serif; background-color: #f3f4f6; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .button { display: inline-block; padding: 12px 24px; background-color: #00F0FF; color: black; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
        .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Reset Your Password</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password for your DevBoards.io account.</p>
        <p>Click the button below to reset it:</p>
        <a href="${resetLink}" class="button">Reset Password</a>
        <p>If you didn't ask to reset your password, you can ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
        <div class="footer">
          <p>© ${new Date().getFullYear()} DevBoards.io. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({ to, subject, html });
};
