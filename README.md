# IT Job Hub Backend

Backend API for the IT Job Hub platform built with ElysiaJS, BunJS, Prisma, and MongoDB Atlas.

## Features

- Authentication with JWT and HttpOnly cookies
- User profiles with languages, skills, seniority, availability, and CV upload
- Job listings with CRUD operations
- Company management with trust scores
- Comment system with replies
- Like/dislike functionality for jobs and comments

## Tech Stack

- **Framework**: ElysiaJS + BunJS
- **Database**: MongoDB Atlas with Prisma ORM
- **Authentication**: JWT with HttpOnly cookies
- **File Upload**: (To be implemented)
- **Notifications**: Mailgun (To be implemented)

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account
- [Mailgun](https://www.mailgun.com/) account (for email notifications)

## Getting Started

1. Clone the repository
2. Navigate to the backend directory:
   ```bash
   cd it-job-hub/backend
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```
5. Generate Prisma client:
   ```bash
   bun run prisma:generate
   ```
6. Run database migrations:
   ```bash
   bun run prisma:migrate
   ```
7. Start the development server:
   ```bash
   bun run dev
   ```

## Environment Variables

See `.env.example` for all required environment variables.

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middleware/      # Custom middleware
├── models/          # Data models (Prisma)
├── routes/          # API route definitions
├── services/        # Business logic
├── utils/           # Utility functions
├── types/           # TypeScript types
└── index.ts         # Entry point
```

## API Documentation

Once the server is running, visit `http://localhost:3001/swagger` for API documentation.

## Deployment

1. Set `NODE_ENV=production` in your environment
2. Ensure all environment variables are set
3. Run `bun run build` to build the project
4. Run `bun run start` to start the server

## Database

This project uses MongoDB Atlas with Prisma ORM. The schema is defined in `prisma/schema.prisma`.

To view and edit data directly, run:
```bash
bun run prisma:studio
```