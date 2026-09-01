# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN npx esbuild prisma/seed.ts --bundle --outfile=prisma/seed.js --platform=node --format=cjs --external:@prisma/client --external:bcryptjs

RUN npx prisma generate
RUN npx nest build

# ── Stage 2: Runner ───────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && apt-get purge -y wget curl 2>/dev/null || true \
  && rm -f /usr/bin/wget /bin/wget /usr/bin/curl /bin/curl 2>/dev/null || true \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/wget \
  && printf '%s\n' '#!/bin/false' > /usr/local/bin/curl \
  && chmod 755 /usr/local/bin/wget /usr/local/bin/curl \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN npm install -g pnpm@9.15.9

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nestjs
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Keep root for entrypoint (drops to nestjs). Do not USER nestjs here.

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
