FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/worker/package.json ./packages/worker/

RUN npm ci --workspace=packages/worker --ignore-scripts

COPY packages/worker ./packages/worker
COPY packages/backend/prisma ./packages/backend/prisma

RUN cd packages/backend && npx prisma generate
RUN cd packages/worker && npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/worker/package.json ./packages/worker/
COPY packages/backend/package.json ./packages/backend/

RUN npm ci --workspace=packages/worker --omit=dev --ignore-scripts

COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/backend/node_modules/.prisma ./packages/backend/node_modules/.prisma
COPY packages/backend/prisma ./packages/backend/prisma

RUN addgroup -g 1001 -S platform && adduser -S platform -u 1001 -G platform
RUN chown -R platform:platform /app
USER platform

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/worker/dist/index.js"]
