# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_ADMIN_HOSTS=admin3.hexalyte.com
ENV NEXT_PUBLIC_ADMIN_HOSTS=$NEXT_PUBLIC_ADMIN_HOSTS

ARG NEXT_PUBLIC_PLATFORM_TENANT=platform
ENV NEXT_PUBLIC_PLATFORM_TENANT=$NEXT_PUBLIC_PLATFORM_TENANT

RUN pnpm build

# ── Stage 2: Runner (Debian slim — NO busybox wget applet) ───
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs \
  && apt-get update -y \
  && apt-get purge -y wget curl 2>/dev/null || true \
  && rm -f /usr/bin/wget /bin/wget /usr/bin/curl /bin/curl \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/wget \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/curl \
  && chmod 755 /usr/local/bin/wget /usr/local/bin/curl \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
