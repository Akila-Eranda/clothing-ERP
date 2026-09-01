# Single-stage build — keeps generated Prisma client + enums intact (pnpm multi-stage broke re-exports).
FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN npx esbuild prisma/seed.ts --bundle --outfile=prisma/seed.js --platform=node --format=cjs --external:@prisma/client --external:bcryptjs
RUN pnpm prisma generate
RUN node scripts/fix-prisma-client.js
RUN pnpm run build

ENV NODE_ENV=production

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nestjs
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
