# Environment Variables — Backend

## Required

```bash
# Server
PORT=3001
HOST=localhost
NODE_ENV=development   # development | production

# Database (MongoDB with replica set required)
DATABASE_URL="mongodb://localhost:27017/itjobhub?replicaSet=rs0&w=1&journal=true"

# JWT — use long random strings in production (min 32 chars)
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_SECRET=change-this-to-another-long-random-secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Email (Mailgun)
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
MAILGUN_FROM_EMAIL=noreply@your-domain.mailgun.org

# CORS — frontend URL
CLIENT_URL=http://localhost:3000
BASE_URL=http://localhost:3001
```

## Optional

```bash
# Feature Flags
FEATURE_USER_REGISTRATION=true
FEATURE_JOB_POSTING=true

# Logging
LOG_LEVEL=info    # trace | debug | info | warn | error

# File Upload
MAX_FILE_SIZE=5242880    # 5MB in bytes
UPLOAD_PATH=./uploads
```

## OAuth (all optional — social login disabled if missing)

```bash
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

## Environments

### Development (local)
```bash
DATABASE_URL="mongodb://127.0.0.1:27017/itjobhub?replicaSet=rs0&w=1&journal=true"
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

### Staging
```bash
DATABASE_URL="mongodb://mongodb-stage:27017/itjobhub_stage?replicaSet=rs0&authSource=admin"
CLIENT_URL=https://stage.devboards.io
NODE_ENV=production
```

### Production
```bash
DATABASE_URL="mongodb://mongodb:27017/itjobhub?replicaSet=rs0&authSource=admin"
CLIENT_URL=https://devboards.io
NODE_ENV=production
```

## Notes

- `DATABASE_URL` must include `replicaSet=rs0` — Prisma requires it for MongoDB transactions.
- In production, `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are injected via GitHub Secrets → server `.env.production` file. They are never committed to git.
- OAuth credentials are optional — if not set, the corresponding social login button returns `503`.
- `FEATURE_USER_REGISTRATION` and `FEATURE_JOB_POSTING` are feature flags — not fully wired in all routes (verify before using).
