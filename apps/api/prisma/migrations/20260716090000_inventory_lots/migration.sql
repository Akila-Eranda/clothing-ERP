-- Inventory lot / batch / expiry modernization (supermarket)
-- Additive: existing Inventory.quantity remains the aggregate source of truth.

CREATE TABLE IF NOT EXISTS "inventory_lots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_lot_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "inventory_lot_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "stock_transfer_lots" (
    "id" TEXT NOT NULL,
    "transferItemId" TEXT NOT NULL,
    "fromLotId" TEXT,
    "toLotId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "stock_transfer_lots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_logs" ADD COLUMN IF NOT EXISTS "lotId" TEXT;

CREATE INDEX IF NOT EXISTS "inventory_lots_tenantId_branchId_variantId_idx" ON "inventory_lots"("tenantId", "branchId", "variantId");
CREATE INDEX IF NOT EXISTS "inventory_lots_tenantId_expiryDate_idx" ON "inventory_lots"("tenantId", "expiryDate");
CREATE INDEX IF NOT EXISTS "inventory_lots_tenantId_branchId_expiryDate_idx" ON "inventory_lots"("tenantId", "branchId", "expiryDate");
CREATE INDEX IF NOT EXISTS "inventory_lots_batchNumber_idx" ON "inventory_lots"("batchNumber");
CREATE INDEX IF NOT EXISTS "inventory_lots_variantId_idx" ON "inventory_lots"("variantId");

CREATE INDEX IF NOT EXISTS "inventory_lot_reservations_lotId_status_idx" ON "inventory_lot_reservations"("lotId", "status");
CREATE INDEX IF NOT EXISTS "inventory_lot_reservations_tenantId_sourceType_sourceId_idx" ON "inventory_lot_reservations"("tenantId", "sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "stock_transfer_lots_transferItemId_idx" ON "stock_transfer_lots"("transferItemId");

CREATE INDEX IF NOT EXISTS "inventory_logs_lotId_idx" ON "inventory_logs"("lotId");
CREATE INDEX IF NOT EXISTS "inventory_logs_tenantId_createdAt_idx" ON "inventory_logs"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "product_variants_barcode_idx" ON "product_variants"("barcode");

ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_lot_reservations" ADD CONSTRAINT "inventory_lot_reservations_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_transfer_lots" ADD CONSTRAINT "stock_transfer_lots_transferItemId_fkey"
  FOREIGN KEY ("transferItemId") REFERENCES "stock_transfer_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
