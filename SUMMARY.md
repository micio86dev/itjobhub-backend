# Backend - DevBoards.io

This repository contains the core API for the DevBoards.io platform. It is designed for high performance, type safety, and scalability.

## Architecture

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [ElysiaJS](https://elysiajs.com/)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/) via [Prisma](https://www.prisma.io/)
- **Documentation**: [Swagger](https://swagger.io/) (available at `/swagger`)

## Core Modules

1.  **Auth**: Secure JWT-based authentication with cookie support.
2.  **Jobs**: Comprehensive job listing management, including searching and filtering (with robust case-insensitive skill matching).
3.  **Companies**: Management of company profiles and trust metrics.
4.  **Community**: Real-time commenting and liking system with robust transaction management (automatic retries for write conflicts).
5.  **Users**: Profile management and personalization data.
6.  **News**: High-performance news article management with multi-language translation support and engagement tracking.

## Quality Standards

- **TypeScript**: 100% type safety with strict schema validation. Verified via comprehensive `tsc` checks.
- **Testing**: Automated unit and integration tests via `bun test`.
- **Security**: Built-in protection with CSRF headers, rate limiting, and input sanitization.

## Recent Changes

### 2026-01-30: Maintenance Scripts Logging Enhancement

- **Improved Logging**: Replaced `console.log` with structured `logger` in maintenance scripts (`check_db.ts`, `check_seeker.ts`) to ensure consistent log formatting and better debugging capabilities.


### 2026-01-23: Tech News Engine Implementation

- Developed **News Service** with support for pagination, category filtering, and polymorphic interactions.
- Implemented **Multi-language Translations** at the schema level using Prisma types for MongoDB.
- Exposed **Management Endpoints** for creating, updating, and deleting news articles (Admin only).
- Integrated **Interaction System** allowing users to like, dislike, and comment on articles with optimized aggregation.
- Added **Engagement Tracking** (views and clicks) with support for authenticated and anonymous metrics.
- Verified system stability with 100% passing build and lint checks.

### 2026-02-08: Prisma & Docker Build Optimization

- **Docker Build Fix**: Resolved an issue where `prisma generate` failed during Docker builds by providing a dummy `DATABASE_URL` and ensuring `prisma.config.ts` is copied into the container.
- **Prisma 6.x Compatibility**: Added `@prisma-ignore` annotations to the schema as required by current Prisma versions for MongoDB environments.
- **Skill Updates**: Enhanced the `prisma-esperto` skill documentation to include these best practices for future development.