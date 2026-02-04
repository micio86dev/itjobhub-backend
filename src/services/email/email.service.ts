
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

  if (!apiKey || !domain || isPlaceholder(apiKey) || isPlaceholder(domain)) {
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

export const sendContactEmail = async (data: { name: string; email: string; subject: string; message: string }) => {
  const adminEmail = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || "micio86dev@gmail.com";

  const emailSubject = `[itjobhub] Contact: ${data.subject} - from ${data.name}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: sans-serif; background-color: #f3f4f6; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #00F0FF; padding-bottom: 10px; margin-bottom: 20px; }
        .field { margin-bottom: 15px; }
        .label { font-weight: bold; color: #374151; font-size: 0.9em; text-transform: uppercase; }
        .value { margin-top: 5px; color: #111827; white-space: pre-wrap; }
        .footer { margin-top: 30px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>New Contact Message</h2>
        </div>
        
        <div class="field">
          <div class="label">From</div>
          <div class="value">${data.name} (${data.email})</div>
        </div>

        <div class="field">
          <div class="label">Subject</div>
          <div class="value">${data.subject}</div>
        </div>

        <div class="field">
          <div class="label">Message</div>
          <div class="value">${data.message}</div>
        </div>

        <div class="footer">
          <p>This message was sent via the contact form on DevBoards.io</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: adminEmail,
    subject: emailSubject,
    html
  });
};
