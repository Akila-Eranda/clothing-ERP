---
name: hexaone-prisma-schema
description: Change the HexaOne database — Prisma schema models, enums, indexes, hand-written migrations, seed data. Use whenever editing apps/api/prisma/schema.prisma, adding a migration folder, or changing seed.ts, so migrations stay safe for live multi-tenant production data.
---

# Prisma schema & migrations (apps/api/prisma)

`schema.prisma` is ~4.5k lines, 150+ models, shared by every tenant in one PostgreSQL database. Production already holds live tenant data, so every change must be **additive and backward-compatible**.

## Model rules
- Every business table has `tenantId String` + `tenant Tenant @relation(..., onDelete: Cascade)` and an index starting with `tenantId` (e.g. `@@index([tenantId, branchId])`, `@@unique([tenantId, code])`). Uniques that users type (SKU, barcode, invoice no.) are scoped per tenant, never global.
- Branch-level data also carries `branchId`; warehouse stock carries `warehouseId`.
- IDs: `String @id @default(cuid())`. Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Quantities are `Float` (weighted goods sell 0.375 kg). Existing money columns are mostly `Float` — match the neighbouring model; do not mix Decimal into an existing flow without converting the whole calculation path.
- Use `@@map("snake_case_table")` / `@map` consistent with nearby models (check the target model before adding).
- New enums: add values at the end; never rename/remove a value that may be stored.

## Migrations — hand-written SQL folders
Folder name: `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_description>/migration.sql` — timestamp later than the newest folder (`ls prisma/migrations | tail -1`).

Write idempotent, non-destructive SQL:
```sql
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pluCode" TEXT;
CREATE INDEX IF NOT EXISTS "products_tenantId_pluCode_idx" ON "products"("tenantId", "pluCode");
DO $$ BEGIN
  CREATE TYPE "ShelfLifeUnit" AS ENUM ('DAYS', 'MONTHS');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'BUNDLE';
```
- New NOT NULL columns need a `DEFAULT` (or add nullable → backfill → set NOT NULL in a later migration).
- No `DROP COLUMN`/`DROP TABLE`/type narrowing without explicit user approval and a data plan.
- Add a leading `--` comment explaining *why* when the change is non-obvious (see `20260927160000_cashier_wallet_gl`).
- After editing schema: `cd apps/api && pnpm prisma:generate` then `pnpm type-check`. To compare schema vs SQL locally: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_URL --script`.
- Deploy applies with `docker compose exec api npx prisma migrate deploy` (see `deploy.sh`, `scripts/deploy_all.py`; CI also runs `migrate deploy`). The container entrypoint does **not** migrate. Never use `db push` against production.

## Seed
- Source of truth: `prisma/seed.ts` (permissions, demo tenant, roles). `seed.js` is an esbuild bundle built by the Dockerfile / `pnpm seed:build` and is not tracked. The seed is for local setup and the initial setup of an EMPTY production database only, never part of deployments (`shared/security/seed-guard.ts`, docs/initial-setup-and-seeding.md).
- Seeds must be idempotent (`upsert`).
- Per-tenant defaults created at registration live in `modules/tenants/tenants.module.ts` and `roles/default-system-roles.ts`, not in seed.

## Checklist
- [ ] tenantId + relation + tenant-leading index
- [ ] migration folder, idempotent SQL, defaults for NOT NULL
- [ ] `prisma generate`, type-check, affected helper specs pass
- [ ] if a column is exposed to the UI, DTO + web types updated
