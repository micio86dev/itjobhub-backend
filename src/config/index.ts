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
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: "llama-3.1-8b-instant",
    maxTokens: 2048
  },
  // Unified multi-model AI config (SPEC 05). The router maps a task to a tier
  // to a model; callers never reference a model literal.
  ai: {
    apiKey: process.env.GROQ_API_KEY || "",
    models: {
      fast: process.env.AI_MODEL_FAST || "llama-3.1-8b-instant",
      struct: process.env.AI_MODEL_STRUCT || "qwen/qwen3-32b",
      reason: process.env.AI_MODEL_REASON || "llama-3.3-70b-versatile"
    },
    maxTokens: {
      extract: parseInt(process.env.AI_MAX_TOKENS_EXTRACT || "2048"),
      rerank: parseInt(process.env.AI_MAX_TOKENS_RERANK || "1024")
    },
    // Search relevance rerank via the REASON tier (opt-in; SPEC 05 §4.7).
    enableRerank: process.env.AI_ENABLE_RERANK === "true",
    rerankCandidates: parseInt(process.env.AI_RERANK_CANDIDATES || "50"),
    cacheTtlMs: parseInt(process.env.AI_CACHE_TTL_MS || "900000") // 15 min
  }
};