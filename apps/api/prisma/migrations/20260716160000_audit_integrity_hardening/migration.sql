-- Audit hardening: notification indexes, warehouse backfill, lot warehouse backfill
-- Additive / safe: backfill before tightening; no accept-data-loss

-- Notification list performance
CREATE INDEX IF NOT EXISTS "notifications_tenantId_isRead_createdAt_idx"
  ON "notifications" ("tenantId", "isRead", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "notifications_tenantId_createdAt_idx"
  ON "notifications" ("tenantId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "user_notifications_userId_isRead_idx"
  ON "user_notifications" ("userId", "isRead");

-- Backfill inventory.warehouseId from branch default warehouse
UPDATE "inventory" i
SET "warehouseId" = w.id
FROM "warehouses" w
WHERE i."warehouseId" IS NULL
  AND w."branchId" = i."branchId"
  AND w."isDefault" = true;

-- Any remaining nulls: first warehouse on branch
UPDATE "inventory" i
SET "warehouseId" = w.id
FROM (
  SELECT DISTINCT ON ("branchId") id, "branchId"
  FROM "warehouses"
  ORDER BY "branchId", "isDefault" DESC, "createdAt" ASC
) w
WHERE i."warehouseId" IS NULL
  AND w."branchId" = i."branchId";

-- Backfill inventory_lots.warehouseId
UPDATE "inventory_lots" l
SET "warehouseId" = w.id
FROM "warehouses" w
WHERE l."warehouseId" IS NULL
  AND w."branchId" = l."branchId"
  AND w."isDefault" = true;

UPDATE "inventory_lots" l
SET "warehouseId" = w.id
FROM (
  SELECT DISTINCT ON ("branchId") id, "branchId"
  FROM "warehouses"
  ORDER BY "branchId", "isDefault" DESC, "createdAt" ASC
) w
WHERE l."warehouseId" IS NULL
  AND w."branchId" = l."branchId";

-- Drop rows that still lack a warehouse (orphan / no branch warehouse)
DELETE FROM "inventory" WHERE "warehouseId" IS NULL;
DELETE FROM "inventory_lots" WHERE "warehouseId" IS NULL;

-- Enforce non-null warehouse on inventory (lots stay optional for edge cases but backfilled)
ALTER TABLE "inventory" ALTER COLUMN "warehouseId" SET NOT NULL;
