FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build ID for Next.js (`deploymentId` in next.config.ts, `?dpl=` on assets, precache revision of /offline). Pass the commit
# (`NEXT_DEPLOYMENT_ID=$(git rev-parse --short=12 HEAD) docker compose up -d --build`, docs/DEPLOY-UPDATE.md) so the same
# commit always yields the same ID. Empty: next.config.ts falls back to a timestamp (every build counts as a new version).
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}

# Build app, then the admin scripts (scripts/*.ts -> dist/scripts/*.cjs) so the runtime stage needs neither tsx nor
# drizzle-kit. build:scripts fails if a script imports a package that is not a runtime dependency.
RUN npm run build && npm run build:scripts

# Production stage
FROM node:26-alpine

WORKDIR /app

# Install dumb-init for proper signal handling and Poppler for CPU-portable
# PDF text extraction. The previous pdf-parse 2.x dependency loaded a native
# Skia canvas binary that raised SIGILL on older x86 hosts during `next build`.
RUN apk add --no-cache dumb-init poppler-utils

# Only the production dependencies. Development tools (tsx, drizzle-kit, esbuild, vitest, eslint, playwright,
# tailwind, types) stay in the builder stage: migrations run through drizzle-orm's migrator (scripts/migrate.mjs)
# and the admin scripts (`docker compose exec app npm run ...`) are precompiled, started by scripts/run.mjs.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built app from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Admin scripts and migrations (not part of the Next.js build output): the compiled scripts, the two plain-JS
# entry points and the SQL migrations. No TypeScript sources are needed at runtime.
COPY --from=builder /app/dist/scripts ./dist/scripts
COPY --from=builder /app/scripts/run.mjs /app/scripts/migrate.mjs ./scripts/
COPY --from=builder /app/drizzle ./drizzle

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Uploaded certification source PDFs (R1.1) - source_uploads_data volume in
# docker-compose.yml mounts here. A named volume that's empty on first run
# inherits ownership/permissions from the image directory it's mounted over,
# so this has to happen before switching to the non-root user below.
RUN mkdir -p /app/data/sources && chown -R nextjs:nodejs /app/data/sources

USER nextjs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
