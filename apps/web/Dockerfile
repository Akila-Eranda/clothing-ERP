# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

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

# ── Stage 2: Runner ───────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 \
  && (command -v wget >/dev/null && ln -sf /bin/false "$(command -v wget)" || true) \
  && (command -v curl >/dev/null && ln -sf /bin/false "$(command -v curl)" || true) \
  && rm -f /usr/bin/wget /bin/wget /usr/bin/curl /bin/curl 2>/dev/null || true \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/wget \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/curl \
  && chmod 755 /usr/local/bin/wget /usr/local/bin/curl \
  && rm -rf /var/cache/apk /tmp/* 2>/dev/null || true

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
