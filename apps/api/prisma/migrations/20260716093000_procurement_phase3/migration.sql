-- Phase 3 Procurement foundation (additive)

DO $$ BEGIN
  CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GoodsReceiptSource" AS ENUM ('FROM_PO', 'DIRECT', 'QUICK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "purchase_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "requestNumber" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "convertedPoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchase_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "unitCostHint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "goods_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "source" "GoodsReceiptSource" NOT NULL DEFAULT 'FROM_PO',
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'POSTED',
    "purchaseId" TEXT,
    "supplierId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "notes" TEXT,
    "supplierInvoiceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "orderedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "lotId" TEXT,
    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "goodsReceiptId" TEXT,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lotId" TEXT,
    "batchNumber" TEXT,
    "reason" TEXT,
    CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" TEXT,
    "goodsReceiptId" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_convertedPoId_key" ON "purchase_requests"("convertedPoId");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_tenantId_requestNumber_key" ON "purchase_requests"("tenantId", "requestNumber");
CREATE INDEX IF NOT EXISTS "purchase_requests_tenantId_idx" ON "purchase_requests"("tenantId");
CREATE INDEX IF NOT EXISTS "purchase_requests_tenantId_status_idx" ON "purchase_requests"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "purchase_request_items_requestId_idx" ON "purchase_request_items"("requestId");

CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_tenantId_grnNumber_key" ON "goods_receipts"("tenantId", "grnNumber");
CREATE INDEX IF NOT EXISTS "goods_receipts_tenantId_idx" ON "goods_receipts"("tenantId");
CREATE INDEX IF NOT EXISTS "goods_receipts_purchaseId_idx" ON "goods_receipts"("purchaseId");
CREATE INDEX IF NOT EXISTS "goods_receipts_supplierId_idx" ON "goods_receipts"("supplierId");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_grnId_idx" ON "goods_receipt_items"("grnId");
CREATE INDEX IF NOT EXISTS "goods_receipt_items_variantId_idx" ON "goods_receipt_items"("variantId");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_returns_tenantId_returnNumber_key" ON "supplier_returns"("tenantId", "returnNumber");
CREATE INDEX IF NOT EXISTS "supplier_returns_tenantId_idx" ON "supplier_returns"("tenantId");
CREATE INDEX IF NOT EXISTS "supplier_returns_supplierId_idx" ON "supplier_returns"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_return_items_returnId_idx" ON "supplier_return_items"("returnId");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_tenantId_supplierId_invoiceNumber_key" ON "supplier_invoices"("tenantId", "supplierId", "invoiceNumber");
CREATE INDEX IF NOT EXISTS "supplier_invoices_tenantId_idx" ON "supplier_invoices"("tenantId");
CREATE INDEX IF NOT EXISTS "supplier_invoices_supplierId_idx" ON "supplier_invoices"("supplierId");
CREATE INDEX IF NOT EXISTS "supplier_payments_invoiceId_idx" ON "supplier_payments"("invoiceId");

ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_convertedPoId_fkey"
  FOREIGN KEY ("convertedPoId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_grnId_fkey"
  FOREIGN KEY ("grnId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_goodsReceiptId_fkey"
  FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_goodsReceiptId_fkey"
  FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
