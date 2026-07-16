-- Grocery / enterprise product master fields
CREATE TYPE "ProductKind" AS ENUM ('STANDARD', 'VARIANT', 'WEIGHTED');
CREATE TYPE "BarcodeMode" AS ENUM ('SHARED', 'UNIQUE');

ALTER TABLE "products" ADD COLUMN "wholesalePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "unit" TEXT;
ALTER TABLE "products" ADD COLUMN "productKind" "ProductKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "products" ADD COLUMN "barcodeMode" "BarcodeMode" NOT NULL DEFAULT 'UNIQUE';
ALTER TABLE "products" ADD COLUMN "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "allowDecimalSelling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "weightScaleReady" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "products_tenantId_productKind_idx" ON "products"("tenantId", "productKind");

ALTER TABLE "supplier_product_assignments" ADD COLUMN "minOrderQty" DOUBLE PRECISION;
ALTER TABLE "supplier_product_assignments" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
