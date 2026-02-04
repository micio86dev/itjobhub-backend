
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

/**
 * Renders a standardized dark-themed email layout matching the site's aesthetics.
 */
export const renderEmailLayout = ({
  subject,
  content,
  footer,
}: {
  subject: string;
  content: string;
  footer?: string;
}) => {
  const year = new Date().getFullYear();
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body {
          background-color: #0d1117;
          color: #c9d1d9;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 0;
          -webkit-font-smoothing: antialiased;
        }
        .wrapper {
          width: 100%;
          table-layout: fixed;
          background-color: #0d1117;
          padding-bottom: 40px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 40px;
        }
        .header {
          padding: 30px;
          text-align: center;
          border-bottom: 1px solid #30363d;
        }
        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .logo-box {
          background-color: #0d1117;
          border: 1px solid rgba(0, 255, 65, 0.5);
          border-radius: 4px;
          padding: 8px 12px;
          color: #00FF41;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-weight: bold;
          font-size: 18px;
          line-height: 1;
          display: inline-block;
          vertical-align: middle;
          margin-right: 12px;
        }
        .logo-text {
          color: #f0f6fc;
          font-size: 20px;
          font-weight: bold;
          letter-spacing: -0.5px;
          line-height: 1;
          display: inline-block;
          vertical-align: middle;
        }
        .logo-highlight {
          color: #00FF41;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
          color: #e6edf3;
        }
        .footer {
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #8b949e;
          border-top: 1px solid #30363d;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #00FF41;
          color: #0d1117;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
          margin-top: 20px;
        }
        h1, h2, h3 {
          color: #f0f6fc;
          margin-top: 0;
        }
        p { margin-bottom: 16px; }
        .divider {
          height: 1px;
          background-color: #30363d;
          margin: 24px 0;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <div class="logo">
              <span class="logo-box">&gt;_</span>
              <span class="logo-text"><span class="logo-highlight">Dev</span>Boards.io</span>
            </div>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            ${footer || `<p>© ${year} DevBoards.io. All rights reserved.</p>`}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

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
  const content = `
    <h2>Reset Your Password</h2>
    <p>Hello,</p>
    <p>We received a request to reset your password for your DevBoards.io account.</p>
    <p>Click the button below to reset it:</p>
    <a href="${resetLink}" class="button">Reset Password</a>
    <p style="margin-top: 24px; font-size: 14px; color: #8b949e;">If you didn't ask to reset your password, you can ignore this email.</p>
    <p style="font-size: 14px; color: #8b949e;">This link will expire in 1 hour.</p>
  `;

  const html = renderEmailLayout({ subject, content });
  await sendEmail({ to, subject, html });
};
