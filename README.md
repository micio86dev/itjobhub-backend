# DevBoards.io — Backend API

REST API for the DevBoards.io platform. Built with ElysiaJS on Bun runtime, Prisma ORM, and MongoDB.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) v1.2+
- **Framework**: [ElysiaJS](https://elysiajs.com/) 1.0.15
- **ORM**: [Prisma](https://www.prisma.io/) 6.19 (MongoDB driver)
- **Database**: MongoDB 7 with replica set
- **Auth**: JWT + HttpOnly refresh tokens + OAuth (GitHub/LinkedIn/Google)
- **Email**: Mailgun
- **Docs**: Swagger at `/docs`

## Prerequisites

- Bun v1.2+
- MongoDB 7 running as replica set (`rs0`)
- (Optional) Mailgun account for email features
- (Optional) OAuth app credentials for social login

## Setup

```bash
cd apps/backend
bun install
cp .env.example .env
# Edit .env — see env.md for all variables
bunx prisma generate
bun run dev         # port 3001
```

## Environment Variables

See [env.md](./env.md) for full documentation. Required:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MongoDB URI with `replicaSet=rs0` |
| `JWT_SECRET` | JWT signing secret (min 32 chars in prod) |
| `REFRESH_TOKEN_SECRET` | Refresh token signing secret |
| `MAILGUN_API_KEY` | Mailgun API key |
| `MAILGUN_DOMAIN` | Mailgun sending domain |
| `CLIENT_URL` | Frontend URL (CORS) |

## Project Structure

```
src/
├── index.ts        # Entry point
├── app.ts          # Elysia app config (CORS, Helmet, rate limit, routes)
├── i18n.ts         # 5-language translation (55 keys)
├── config/         # Environment + OAuth config
├── middleware/      # Auth middleware (JWT verification)
├── routes/          # Route definitions (11 files)
├── services/        # Business logic (13 service dirs)
├── db/              # Prisma client
└── utils/           # Logger, JWT, password, response helpers
prisma/
└── schema.prisma    # MongoDB schema (12 models)
tests/
└── *.test.ts        # 10 test files
```

## Scripts

```bash
bun run dev          # Development with watch
bun run start        # Production
bun run build        # Compile to dist/
bun test             # Run test suite
bun test --coverage  # Coverage report
bun run lint         # ESLint
bun run type-check   # TypeScript strict check
```

## API Documentation

Start the server and visit `http://localhost:3001/docs` for Swagger UI.

## API Summary

~50 REST endpoints across:
- `POST|GET /auth/*` — registration, login, OAuth, refresh, password reset
- `GET|POST|PUT|DELETE /jobs/*` — job CRUD, search, import, match scoring
- `GET|POST|PUT|DELETE /news/*` — news CRUD, import
- `POST|GET|PUT|DELETE /comments/*` — polymorphic comments
- `POST|DELETE|GET /likes/*` — polymorphic reactions
- `POST|GET|PUT|DELETE /companies/*`
- `POST|GET|PUT|DELETE /messages/*` — contact system
- `GET /admin/stats/*` — dashboard analytics
- `GET|POST|PUT|DELETE /users/*`
- `GET /favorites/*`
- `GET /image-proxy` — external image proxy with caching

## Testing

```bash
bun test                    # All tests
bun test tests/api.test.ts  # Integration tests (requires MongoDB)
bun test --watch            # Watch mode
```

Pre-commit hook (Husky) runs `bun test` automatically. Tests fail → commit blocked.

## Docker

```bash
# Multi-stage build
docker build -t devboards-backend .

# Runs as non-root user (uid 1001)
# Healthcheck: GET /health
```

## MongoDB Replica Set (Local)

```bash
mongod --replSet rs0 --dbpath /data/db
mongosh --eval "rs.initiate()"
```

Prisma requires a replica set for transaction support.
