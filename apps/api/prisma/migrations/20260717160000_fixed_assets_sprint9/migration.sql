-- Sprint 9 — Fixed Assets register, depreciation, disposal, transfers

CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE');
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED');
CREATE TYPE "FixedAssetTxnType" AS ENUM ('ACQUISITION', 'DEPRECIATION', 'DISPOSAL', 'TRANSFER', 'ADJUSTMENT');

CREATE TABLE "fixed_asset_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "residualValuePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRate" DOUBLE PRECISION,
    "assetGlAccountId" TEXT,
    "accumDepGlAccountId" TEXT,
    "depExpenseGlAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "residualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRate" DOUBLE PRECISION,
    "accumulatedDep" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bookValue" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "serialNumber" TEXT,
    "vendorName" TEXT,
    "assetGlAccountId" TEXT,
    "accumDepGlAccountId" TEXT,
    "depExpenseGlAccountId" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalProceeds" DOUBLE PRECISION,
    "disposalNotes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_depreciations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "accumAfter" DOUBLE PRECISION NOT NULL,
    "bookValueAfter" DOUBLE PRECISION NOT NULL,
    "journalEntryId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "fixed_asset_depreciations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fixed_asset_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "FixedAssetTxnType" NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fixed_asset_categories_tenantId_code_key" ON "fixed_asset_categories"("tenantId", "code");
CREATE INDEX "fixed_asset_categories_tenantId_idx" ON "fixed_asset_categories"("tenantId");

CREATE UNIQUE INDEX "fixed_assets_tenantId_code_key" ON "fixed_assets"("tenantId", "code");
CREATE INDEX "fixed_assets_tenantId_idx" ON "fixed_assets"("tenantId");
CREATE INDEX "fixed_assets_tenantId_status_idx" ON "fixed_assets"("tenantId", "status");
CREATE INDEX "fixed_assets_tenantId_branchId_idx" ON "fixed_assets"("tenantId", "branchId");

CREATE UNIQUE INDEX "fixed_asset_depreciations_assetId_periodLabel_key" ON "fixed_asset_depreciations"("assetId", "periodLabel");
CREATE INDEX "fixed_asset_depreciations_tenantId_periodStart_idx" ON "fixed_asset_depreciations"("tenantId", "periodStart");
CREATE INDEX "fixed_asset_depreciations_assetId_idx" ON "fixed_asset_depreciations"("assetId");

CREATE INDEX "fixed_asset_transactions_tenantId_assetId_idx" ON "fixed_asset_transactions"("tenantId", "assetId");
CREATE INDEX "fixed_asset_transactions_tenantId_txnDate_idx" ON "fixed_asset_transactions"("tenantId", "txnDate");

ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "fixed_asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_depreciations" ADD CONSTRAINT "fixed_asset_depreciations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_transactions" ADD CONSTRAINT "fixed_asset_transactions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
