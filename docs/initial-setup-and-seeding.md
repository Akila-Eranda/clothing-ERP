# Initial setup and seeding

**Owner decision (6 Nov 2026):** the seed is **not** part of deployments. Normal production deployments run migrations only; they never create or change shops, users, roles or permissions.

## When the seed runs

| Situation | What happens |
|---|---|
| Local development, tests, CI (`NODE_ENV` not `production`) | runs; idempotent (a second run changes nothing) |
| Production deploy (any script, no flag) | **skipped**, exit 0 |
| Production with `HEXA_INITIAL_SETUP=empty-database-only`, database already has any shop | **refused**, exit 1, nothing written |
| Production with that flag, database has no shops | runs once, as the initial setup |

The rule is enforced inside the seed itself (`apps/api/src/shared/security/seed-guard.ts`, checked before the first database write), so old or one-off scripts cannot bypass it. The seed steps have also been removed from every deploy script, and the scripts that existed only to seed or that ran `prisma db push --accept-data-loss` are disabled.

## New, empty database (developers, CI, disaster-recovery drill)

```bash
cd apps/api
DATABASE_URL=postgresql://USER:PASS@HOST:5432/NEW_DB node scripts/db-fresh-install.mjs
```

1. Refuses unless the database is completely empty.
2. Applies `prisma/baseline/baseline.sql` (the schema at main `d8326a8`) and records the 44 migrations in `prisma/baseline/baseline-migrations.txt` as applied.
3. Runs `prisma migrate deploy` for every later migration, which is the same path production uses.
4. Checks that the result equals `prisma/schema.prisma`.

A `0_init` migration is deliberately **not** used: production has never applied one, so `migrate deploy` would try to recreate existing tables and the release would fail.

## Seed (local / initial setup only)

Passwords come from the environment and are never stored in the repository (minimum 12 characters; the old published defaults are refused):

```bash
export SEED_ADMIN_PASSWORD=...   SEED_CASHIER_PASSWORD=...   SEED_MANAGER_PASSWORD=...
# local:
pnpm --filter api seed            # or: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
# production initial setup of an EMPTY database only (after db-fresh-install.mjs):
NODE_ENV=production HEXA_INITIAL_SETUP=empty-database-only node prisma/seed.js
```

If a password variable is not set, a random one is generated. It is printed only outside production; in production use the password-reset flow.

What the seed creates: the platform tenant and admin, the demo shops (clothing, grocery, hardware, agriculture, spare parts, tyres, general, cake house) with default roles (all 43 permissions for each shop admin), categories and a little demo data. It only creates missing records (`upsert` with empty `update`), with one exception kept from before: for the **demo** clothing shop it re-synchronises the permissions of its Cashier / Branch Manager / Inventory Manager / Accountant / Purchasing roles on each run. That is acceptable locally; in production it cannot happen any more because the seed does not run there.

## Windows checkouts

`*.sh` files are now forced to LF (`.gitattributes`). The API image also strips CR from `docker-entrypoint.sh`, so an image built from a Windows checkout starts normally.

On Windows with pnpm, run `node scripts/fix-prisma-client.js` (in `apps/api`, after `prisma generate`) so `@prisma/client` resolves to the generated client, which is the same step the Dockerfile runs.
