# ARG for version tracking
ARG APP_VERSION=edge

# ==========================================
# Stage 1: Build & Compile
# ==========================================
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock tsconfig.json ./
# Copy prisma schema and config file
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies (dev included for build)
RUN bun install --frozen-lockfile

# Generate prisma client (dummy DATABASE_URL for generation only - runtime uses real value)
RUN DATABASE_URL="mongodb://dummy:27017/dummy" bun run prisma generate

# Copy source code
COPY src ./src

# Compile to a single binary
# --target bun-linux-x64-modern is usually default but explicit is good
# We assume the entry point is src/index.ts. Adjust if it is src/server.ts or similar.
RUN bun build --compile --minify --sourcemap ./src/index.ts --outfile server

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM oven/bun:1-alpine AS runner

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 --ingroup nodejs nextjs

WORKDIR /app

# Copy binary from builder
COPY --from=builder --chown=nextjs:nodejs /app/server ./server

# Copy Prisma client with native query engine (required for database connectivity)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Metadata
ARG APP_VERSION
LABEL org.opencontainers.image.version=${APP_VERSION}
LABEL org.opencontainers.image.title="Backend API"
LABEL org.opencontainers.image.vendor="DevBoards"

# User context
USER nextjs

# Expose port (default for Elysia often 3000, mapped by compose)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start
CMD ["./server"]
