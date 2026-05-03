# DevBoards.io — Backend Summary

REST API for the DevBoards.io platform. See [README.md](./README.md) for setup.
See root [MEMORY.md](../../MEMORY.md) for system-wide context.
See [specs/backend/](../../specs/backend/) for full feature specs.

## Modules

| Module | Routes | Description |
|--------|--------|-------------|
| Auth | `POST /auth/*` | Email/password + OAuth (GitHub/LinkedIn/Google), JWT + refresh tokens |
| Jobs | `GET|POST|PUT|DELETE /jobs/*` | CRUD, search/filter, match scoring, bulk import |
| News | `GET|POST|DELETE /news/*` | Multi-language articles, category filtering |
| Comments | `POST|GET|PUT|DELETE /comments/*` | Polymorphic (jobs + news), threaded replies |
| Likes | `POST|DELETE|GET /likes/*` | Polymorphic reactions (LIKE/DISLIKE) |
| Companies | `GET|POST|PUT|DELETE /companies/*` | Company profiles with trust scores |
| Users | `GET|PUT /users/*` | Profile management, skills |
| Favorites | `POST|DELETE|GET /favorites/*` | Saved jobs |
| Messages | `POST|GET|PUT|DELETE /messages/*` | Contact system with admin replies |
| Admin | `GET /admin/stats/*` | Dashboard analytics (requires admin role) |
| Tracking | (internal) | Interaction recording (VIEW/APPLY/CLICK) |
| Image Proxy | `GET /image-proxy` | Proxied external images with 1-year cache |

## Auth Flow

```
POST /auth/login
  → password check (bcrypt 12 rounds)
  → JWT (1h) in response body
  → refresh token (7d) in HttpOnly cookie
  → user fetched from DB (not JWT payload) on each request
```

## Database (MongoDB, Prisma)

12 models: `User`, `UserProfile`, `Job`, `Company`, `Seniority`, `News`,
`Comment`, `Like`, `RefreshToken`, `Favorite`, `Interaction`, `Contact`, `ContactReply`

Shared with `job_scraper` and `news_scraper` (direct MongoDB writes).

## Security

- Rate limiting: 1000 req/60s per IP (in-memory — not suitable for horizontal scaling)
- Helmet: standard HTTP security headers
- CORS: explicit origin whitelist (devboards.io + stage + localhost)
- Auth middleware: re-fetches user from DB on every authenticated request
- Input validation: Elysia schema validation on all routes

## Known Issues

- Redis deployed but backend has no cache integration
- `Interaction` collection: no TTL index → unbounded growth
- N+1 potential on job listings (company fetch per job)
- In-memory rate limiter not suitable for multi-instance deployments
