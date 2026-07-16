-- Supplier product assignments (variant ↔ supplier mapping)

CREATE TABLE IF NOT EXISTS "supplier_product_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplierProductCode" TEXT,
    "leadTimeDays" INTEGER,
    "lastBuyingPrice" DOUBLE PRECISION,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_product_assignments_supplierId_variantId_key"
    ON "supplier_product_assignments"("supplierId", "variantId");

CREATE INDEX IF NOT EXISTS "supplier_product_assignments_tenantId_supplierId_idx"
    ON "supplier_product_assignments"("tenantId", "supplierId");

CREATE INDEX IF NOT EXISTS "supplier_product_assignments_tenantId_variantId_idx"
    ON "supplier_product_assignments"("tenantId", "variantId");

DO $$ BEGIN
    ALTER TABLE "supplier_product_assignments"
        ADD CONSTRAINT "supplier_product_assignments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "supplier_product_assignments"
        ADD CONSTRAINT "supplier_product_assignments_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "supplier_product_assignments"
        ADD CONSTRAINT "supplier_product_assignments_variantId_fkey"
        FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
