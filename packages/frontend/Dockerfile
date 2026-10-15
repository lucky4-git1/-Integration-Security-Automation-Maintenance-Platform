FROM node:20-alpine AS builder

ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/worker/package.json ./packages/worker/

RUN npm ci --workspace=packages/frontend --ignore-scripts

COPY packages/frontend ./packages/frontend

RUN cd packages/frontend && npm run build

# ── Runtime (nginx) ────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
