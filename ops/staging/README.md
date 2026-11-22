# Staging runbook (isolated; no production access, no production secrets)

Everything here was rehearsed locally in Docker (see `docs/QA/HEXALYTE_STAGING_RELEASE_READINESS.md` for what was and was not
proven). A real staging host is a separate machine/network with its **own** database, Redis, secrets and domain.

## Files
| File | Purpose |
|---|---|
| `docker-compose.staging.yml`, `.env.staging.example` | isolated stack (own project/network/volumes, 127.0.0.1 ports only, production-grade hardening) |
| `verify-bank-account-fk.sql` / `rollback-bank-account-fk.sql` | read-only rule check / exact rollback of the one migration |
| `role-gap-report.sql` | read-only: which shops' Tenant Admin lacks catalogue permissions |
| `outbox-backlog.sql` | read-only: accounting outbox backlog before enabling the sweeper |
| `reconciliation-checks.sql` | read-only financial reconciliation (R1-R9), all should return zero rows |
| `verify-private-storage.sh` | run in the API container: private WhatsApp storage owner/mode/location |
| `verify-redis-ownership.cjs` | run in the API container: Redis connectivity + cross-instance WhatsApp ownership |
| `staging-smoke.cjs` | API smoke test for QA-001…QA-007 (staging accounts only; refuses production-looking URLs) |
| `../../apps/api/test-int/browser/*` | browser tests (roles x viewports, custom items, Cash & Bank page) |

## Sequence (each step has a success condition; stop at the first failure)
Use `C="docker compose -p hexalyte-staging --env-file .env.staging -f docker-compose.staging.yml"`.

1. **Secrets.** `cp .env.staging.example .env.staging`; fill with fresh staging-only values. *Success:* no value equals any production value; `.env.staging` is git-ignored.
2. **Build.** `$C build api-a web`. *Success:* both images build (the API image runs `nest build`; the web image runs `next build`).
3. **Data + services.** `$C up -d postgres redis` → healthy. Database = a **sanitised** restore of a production backup (preferred; PENDING owner action) or `node scripts/db-fresh-install.mjs` through the image:
   `$C run --rm --no-deps --entrypoint node api-a scripts/db-fresh-install.mjs`. *Note:* the image entrypoint always starts the API; one-off commands need `--entrypoint node`.
4. **Pre-flight (read-only).** `$C exec -T postgres psql -U <user> -d <db> -X < ops/staging/outbox-backlog.sql` and `role-gap-report.sql`. *Success:* backlog understood (see readiness doc §6); list of tenants to review produced.
5. **Migration (restored copy only).** `$C run --rm --no-deps --entrypoint node api-a node_modules/prisma/build/index.js migrate deploy`. *Success:* "All migrations have been successfully applied"; `verify-bank-account-fk.sql` shows RESTRICT on every row.
6. **Role review.** Dry run per tenant: `$C run --rm --no-deps --entrypoint node api-a -r ts-node/register -r tsconfig-paths/register scripts/review-system-roles.ts --tenant <id>`; then `--apply --confirm <id> --actor "<name>" --add-only`. *Note:* the apply also **creates missing standard roles** (Cashier / Branch Manager); read the dry run. *Success:* `role-gap-report.sql` shows the tenant fully granted; custom roles unchanged.
7. **Start apps.** `$C up -d api-a web` (and `--profile multi up -d api-b` to test two instances). *Success:* `/api/v1/health` = 200 on every API.
8. **Storage + Redis.** `$C exec -T api-a sh -s < ops/staging/verify-private-storage.sh` (all PASS); `$C exec -T api-a node - selfcheck < ops/staging/verify-redis-ownership.cjs`; cross-instance: `hold` on api-a, `probe` on api-b (must be REFUSED).
9. **Smoke.** Seed a fixture shop (`apps/api/test-int/browser/seed-browser-env.ts`, staging DB only) then `node ops/staging/staging-smoke.cjs` (27 checks) and the three browser scripts. *Success:* all pass.
10. **Reconciliation.** `reconciliation-checks.sql` → every section empty; outbox: all `POSTED`.
11. **Logs.** No `connection pool`, `EACCES`, `ECONN`, no unexpected 5xx. (`prisma:error ... Unique constraint ... clientRequestId` lines are the idempotency guard working.)
12. **Sign-off.** Business owner runs the manual acceptance list in the readiness doc §10.

## Rollback
* **Application:** keep the previous image tags (`docker tag` before building); `$C up -d api-a web` with the old tags. No data format changed.
* **Migration:** `psql -f ops/staging/rollback-bank-account-fk.sql` then `prisma migrate resolve --rolled-back 20261122090000_bank_account_restrict_delete`. Leaving it in place is harmless.
* **Outbox sweeper:** `ACCOUNTING_OUTBOX_SWEEP=false`, recreate the API. Written intents stay PENDING.
* **WhatsApp auto-resume:** `WHATSAPP_AUTO_RESUME=false`.
* **Staging teardown:** `$C --profile multi down -v` (destroys the staging volumes only; project-scoped).
