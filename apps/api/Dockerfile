# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN npx esbuild prisma/seed.ts --bundle --outfile=prisma/seed.js --platform=node --format=cjs --external:@prisma/client --external:bcryptjs

RUN pnpm prisma generate
RUN pnpm build

# ── Stage 2: Runner ───────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nestjs
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
