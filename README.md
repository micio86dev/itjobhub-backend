# DevBoards.io Backend

Backend API for the DevBoards.io platform built with ElysiaJS, BunJS, Prisma, and MongoDB Atlas.

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

## Quality Assurance

### Linting & Type Checking
We use TypeScript for strict type checking. To verify the codebase:
```bash
bun x tsc --noEmit
```

### Testing
We use the native Bun test runner.
- **Run all tests**: `bun test`
- **Watch mode**: `bun test --watch`
- **Coverage**: `bun test --coverage`

> [!NOTE]
> Integration tests (located in `tests/api.test.ts`) require a running MongoDB instance or a valid `DATABASE_URL` in your `.env`.

## Deployment

1. Set `NODE_ENV=production` in your environment
2. Ensure all environment variables are set
3. Run `bun run build` to build the project
4. Run `bun run start` to start the server
## Git Hooks (Husky)

This project uses [Husky](https://typicode.github.io/husky/) to enforce code quality with pre-commit hooks.

### Installation
To install Husky and its hooks (if not automatically installed):

```shell
bun run prepare
# or explicitly
bun husky init
```

### Pre-commit Hook
Husky is configured to run automatically before you commit.
- **Action**: Runs `bun test`.
- **Behavior**: If tests fail, the commit is **blocked**. You must fix the tests before committing.

### Testing the Hook
To verify the hook works:
1. Introduce a failure (e.g. modify a test to fail).
2. Try to commit: `git commit -m "test"`.
3. The commit should fail.
4. Revert changes and commit again.
