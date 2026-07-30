-- POS mobile reload / recharge cards

CREATE TYPE "ReloadSaleType" AS ENUM ('DIGITAL', 'PHYSICAL');
CREATE TYPE "ReloadCardStatus" AS ENUM ('AVAILABLE', 'SOLD', 'VOID');

CREATE TABLE "reload_operators" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digitalCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "physicalCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reload_denominations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "faceValue" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_denominations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reload_card_stocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "operatorId" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "pinMasked" TEXT NOT NULL,
    "purchaseCost" DOUBLE PRECISION,
    "status" "ReloadCardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "soldSaleId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_card_stocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reload_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "ReloadSaleType" NOT NULL,
    "operatorId" TEXT NOT NULL,
    "denominationId" TEXT,
    "cardStockId" TEXT,
    "msisdn" TEXT,
    "faceValue" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reload_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reload_operators_tenantId_code_key" ON "reload_operators"("tenantId", "code");
CREATE INDEX "reload_operators_tenantId_isActive_idx" ON "reload_operators"("tenantId", "isActive");

CREATE UNIQUE INDEX "reload_denominations_operatorId_faceValue_key" ON "reload_denominations"("operatorId", "faceValue");
CREATE INDEX "reload_denominations_tenantId_idx" ON "reload_denominations"("tenantId");
CREATE INDEX "reload_denominations_operatorId_isActive_idx" ON "reload_denominations"("operatorId", "isActive");

CREATE UNIQUE INDEX "reload_card_stocks_tenantId_pinCode_key" ON "reload_card_stocks"("tenantId", "pinCode");
CREATE INDEX "reload_card_stocks_tenantId_status_idx" ON "reload_card_stocks"("tenantId", "status");
CREATE INDEX "reload_card_stocks_operatorId_denominationId_status_idx" ON "reload_card_stocks"("operatorId", "denominationId", "status");

CREATE INDEX "reload_sales_tenantId_createdAt_idx" ON "reload_sales"("tenantId", "createdAt");
CREATE INDEX "reload_sales_saleId_idx" ON "reload_sales"("saleId");
CREATE INDEX "reload_sales_operatorId_idx" ON "reload_sales"("operatorId");

ALTER TABLE "reload_operators" ADD CONSTRAINT "reload_operators_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_denominations" ADD CONSTRAINT "reload_denominations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_denominations" ADD CONSTRAINT "reload_denominations_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "reload_denominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "reload_denominations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_cardStockId_fkey" FOREIGN KEY ("cardStockId") REFERENCES "reload_card_stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
