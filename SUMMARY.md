# Backend - IT Job Hub

This repository contains the core API for the IT Job Hub platform. It is designed for high performance, type safety, and scalability.

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

## Quality Standards

- **TypeScript**: 100% type safety with strict schema validation. Verified via comprehensive `tsc` checks.
- **Testing**: Automated unit and integration tests via `bun test`.
- **Security**: Built-in protection with CSRF headers, rate limiting, and input sanitization.