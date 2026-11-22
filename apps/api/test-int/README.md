# Integration, e2e and browser tests against a throw-away environment

Nothing here ever touches a real shop database. The runners refuse any database that is not on `localhost` /
`127.0.0.1` with a name starting `hexa_qa`, and generate throw-away JWT secrets per run.

## 1. Start the throw-away services (Docker)

```bash
# PostgreSQL 16 on 127.0.0.1:57431, Redis 7 on 127.0.0.1:57432 - random one-time passwords, nothing persisted
PGPW=$(openssl rand -hex 16); REDISPW=$(openssl rand -hex 12)
docker run -d --name hexa_qa_pg    -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB=hexa_qa -p 127.0.0.1:57431:5432 postgres:16-alpine
docker run -d --name hexa_qa_redis -p 127.0.0.1:57432:6379 redis:7-alpine redis-server --requirepass "$REDISPW"

# empty database that matches prisma/schema.prisma (baseline + every later migration)
DATABASE_URL="postgresql://postgres:$PGPW@127.0.0.1:57431/hexa_qa" node scripts/db-fresh-install.mjs
```

## 2. Run

```bash
export HEXA_INT_DATABASE_URL="postgresql://postgres:$PGPW@127.0.0.1:57431/hexa_qa"
export HEXA_INT_REDIS_PORT=57432 HEXA_INT_REDIS_PASSWORD="$REDISPW"

# real-PostgreSQL integration tests (customer receivables, outbox, shift close, bank accounts, WhatsApp lock)
npx jest -c test-int/jest-int.config.ts --runInBand

# the full-app HTTP e2e suites in test/*.e2e-spec.ts (run ONE run at a time: they share Redis PIN counters)
node test-int/run-e2e-local.cjs                    # all
node test-int/run-e2e-local.cjs payment-qr-403     # one

# pool-deadlock probe: run any flow with a pool of ONE connection; a code path that borrows a second connection
# while holding one will time out
HEXA_INT_DATABASE_URL="...hexa_qa?connection_limit=1&pool_timeout=25" npx jest -c test-int/jest-int.config.ts --runInBand
```

Without `HEXA_INT_DATABASE_URL` every integration suite is skipped, so the normal `npx jest` is unaffected.

## 3. Browser tests (local Chrome through playwright-core)

Install `playwright-core` OUTSIDE the repository (the repo's dependencies are not changed), start the API and the web app
against the throw-away DB, seed one shop, then run the scripts:

```bash
# seed: prints the shop description JSON
HEXA_BROWSER_PASSWORD="Pw-$(openssl rand -hex 10)" npx ts-node --transpile-only -r tsconfig-paths/register test-int/browser/seed-browser-env.ts
# API (port 3199) and web (port 3200, NEXT_PUBLIC_API_URL=http://127.0.0.1:3199/api/v1 next dev -p 3200) as usual, then:
BROWSER_SEED='<json>' HEXA_BROWSER_PASSWORD=... NODE_PATH=<dir>/node_modules node test-int/browser/browser-smoke.cjs      # 3 roles x 3 viewports
BROWSER_SEED='<json>' HEXA_BROWSER_PASSWORD=... NODE_PATH=<dir>/node_modules node test-int/browser/browser-pos-custom.cjs # custom items by role
```
