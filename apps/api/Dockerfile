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
RUN node -e "const fs=require('fs');const path=require('path');const pkg=path.dirname(require.resolve('@prisma/client/package.json'));const rel=path.relative(pkg,path.join('/app/node_modules/.prisma/client/default')).replace(/\\\\/g,'/');fs.writeFileSync(path.join(pkg,'index.js'),\"module.exports = require('\"+rel+\"');\\n\");const g=require('@prisma/client').Gender;if(!g)process.exit(1);"
RUN pnpm run build

ENV NODE_ENV=production

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nestjs
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
