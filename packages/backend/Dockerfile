FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/worker/package.json ./packages/worker/

# Install all deps (needed for workspace linking)
RUN npm ci --workspace=packages/backend --ignore-scripts

COPY packages/backend ./packages/backend

# Generate Prisma client
RUN cd packages/backend && npx prisma generate

# Build
RUN cd packages/backend && npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/

RUN npm ci --workspace=packages/backend --omit=dev --ignore-scripts

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/node_modules/.prisma ./packages/backend/node_modules/.prisma
COPY packages/backend/prisma ./packages/backend/prisma

# Create log directory
RUN mkdir -p /app/logs

# Non-root user
RUN addgroup -g 1001 -S platform && adduser -S platform -u 1001 -G platform
RUN chown -R platform:platform /app
USER platform

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/backend/dist/index.js"]
