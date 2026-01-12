import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001"),
  host: process.env.HOST || "localhost",
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  database: {
    url: process.env.DATABASE_URL || ""
  },
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || "",
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
  },
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || "",
    domain: process.env.MAILGUN_DOMAIN || "",
    fromEmail: process.env.MAILGUN_FROM_EMAIL || ""
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "5242880"), // 5MB default
    uploadPath: process.env.UPLOAD_PATH || "./uploads"
  },
  features: {
    userRegistration: process.env.FEATURE_USER_REGISTRATION === "true",
    jobPosting: process.env.FEATURE_JOB_POSTING === "true"
  }
};