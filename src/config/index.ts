import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001"),
  host: process.env.HOST || "localhost",
  // `bun build --compile` statically INLINES `process.env.NODE_ENV` at build
  // time (the Docker builder stage leaves it unset → inlined as "development"),
  // so the container's runtime NODE_ENV is ignored. `APP_ENV` is NOT special-
  // cased by the bundler and IS read at runtime, so it is the source of truth
  // for the deployed environment (set per-env in docker-compose). NODE_ENV
  // remains as a fallback for local `bun run dev` (non-compiled).
  nodeEnv: process.env.APP_ENV || process.env.NODE_ENV || "development",
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
  // Max number of APPLY interactions a single user may record per rolling 24h
  // (enforced in routes/jobs.ts). Configurable via DAILY_APPLY_LIMIT.
  dailyApplyLimit: parseInt(process.env.DAILY_APPLY_LIMIT || "3", 10),
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: "llama-3.1-8b-instant",
    maxTokens: 2048
  },
  // Manual scraper trigger: the dashboard "Run import" button dispatches the
  // scrapers GitHub Actions workflow. Token/repo/workflow are injected from
  // GitHub Secrets at deploy time (see backend-ci-cd.yml), never hand-edited.
  scraperDispatch: {
    token: process.env.GH_DISPATCH_TOKEN || "",
    repo: process.env.GH_DISPATCH_REPO || "micio86dev/itjobhub-antigravity-config",
    workflow: process.env.GH_DISPATCH_WORKFLOW || "scrapers-ci-cd.yml"
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