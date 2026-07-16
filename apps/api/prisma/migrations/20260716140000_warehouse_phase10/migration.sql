-- Phase 10 Warehouse: multi-warehouse locations, transfer warehouse fields, inventory uniqueness by warehouse

CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "warehouses_tenantId_branchId_idx" ON "warehouses"("tenantId", "branchId");

DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure inventory.warehouseId column exists
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "inventory_lots" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "fromWarehouseId" TEXT;
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "toWarehouseId" TEXT;

-- Backfill one default warehouse per branch
INSERT INTO "warehouses" ("id", "tenantId", "branchId", "name", "code", "isDefault", "isActive", "createdAt", "updatedAt")
SELECT
  'wh_' || b."id",
  b."tenantId",
  b."id",
  b."name" || ' Main',
  UPPER(LEFT(REGEXP_REPLACE(b."code", '[^A-Za-z0-9]', '', 'g'), 8)) || '-MAIN',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "branches" b
WHERE NOT EXISTS (
  SELECT 1 FROM "warehouses" w WHERE w."branchId" = b."id" AND w."isDefault" = true
)
ON CONFLICT ("id") DO NOTHING;

-- Fix code collisions across tenants by appending branch id suffix when needed
UPDATE "warehouses" w
SET "code" = w."code" || '-' || RIGHT(w."branchId", 4)
WHERE w."isDefault" = true
  AND EXISTS (
    SELECT 1 FROM "warehouses" o
    WHERE o."tenantId" = w."tenantId" AND o."code" = w."code" AND o."id" <> w."id"
  );

UPDATE "inventory" i
SET "warehouseId" = w."id"
FROM "warehouses" w
WHERE i."branchId" = w."branchId"
  AND w."isDefault" = true
  AND (i."warehouseId" IS NULL OR i."warehouseId" = '');

UPDATE "inventory_lots" l
SET "warehouseId" = w."id"
FROM "warehouses" w
WHERE l."branchId" = w."branchId"
  AND w."isDefault" = true
  AND (l."warehouseId" IS NULL OR l."warehouseId" = '');

-- Drop legacy branch+variant uniqueness (name may vary)
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_branchId_variantId_key";
DROP INDEX IF EXISTS "inventory_branchId_variantId_key";

-- Inventory rows without warehouse cannot participate in new unique key — delete orphans if any
DELETE FROM "inventory" WHERE "warehouseId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_warehouseId_variantId_key" ON "inventory"("warehouseId", "variantId");
CREATE INDEX IF NOT EXISTS "inventory_branchId_variantId_idx" ON "inventory"("branchId", "variantId");
CREATE INDEX IF NOT EXISTS "inventory_lots_tenantId_warehouseId_variantId_idx" ON "inventory_lots"("tenantId", "warehouseId", "variantId");
CREATE INDEX IF NOT EXISTS "stock_transfers_fromWarehouseId_idx" ON "stock_transfers"("fromWarehouseId");
CREATE INDEX IF NOT EXISTS "stock_transfers_toWarehouseId_idx" ON "stock_transfers"("toWarehouseId");

DO $$ BEGIN
  ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey"
    FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey"
    FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
