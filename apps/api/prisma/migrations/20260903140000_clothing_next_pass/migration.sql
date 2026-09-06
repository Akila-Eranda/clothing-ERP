-- Clothing next-pass: locations, colors, bundles, fitting rooms
-- Backward compatible; other verticals ignore these tables.
-- Additive only (CREATE IF NOT EXISTS / enum guards). No DROP / DELETE / UPDATE of existing rows.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ProductKind' AND e.enumlabel = 'BUNDLE'
  ) THEN
    ALTER TYPE "ProductKind" ADD VALUE 'BUNDLE';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "FittingSessionStatus" AS ENUM ('IN_FITTING', 'RESERVED', 'SOLD', 'RETURNED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "store_floors" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_floors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_floors_tenantId_branchId_code_key" ON "store_floors"("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "store_floors_tenantId_branchId_idx" ON "store_floors"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "store_sections" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "floorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_sections_tenantId_branchId_code_key" ON "store_sections"("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "store_sections_floorId_idx" ON "store_sections"("floorId");
CREATE INDEX IF NOT EXISTS "store_sections_tenantId_branchId_idx" ON "store_sections"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "store_racks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_racks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_racks_tenantId_branchId_code_key" ON "store_racks"("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "store_racks_sectionId_idx" ON "store_racks"("sectionId");
CREATE INDEX IF NOT EXISTS "store_racks_tenantId_branchId_idx" ON "store_racks"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "store_shelves" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "rackId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_shelves_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "store_shelves_tenantId_branchId_code_key" ON "store_shelves"("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "store_shelves_rackId_idx" ON "store_shelves"("rackId");
CREATE INDEX IF NOT EXISTS "store_shelves_tenantId_branchId_idx" ON "store_shelves"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "variant_shelf_locations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "shelfId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "variant_shelf_locations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "variant_shelf_locations_tenantId_branchId_variantId_key" ON "variant_shelf_locations"("tenantId", "branchId", "variantId");
CREATE INDEX IF NOT EXISTS "variant_shelf_locations_shelfId_idx" ON "variant_shelf_locations"("shelfId");
CREATE INDEX IF NOT EXISTS "variant_shelf_locations_variantId_idx" ON "variant_shelf_locations"("variantId");

CREATE TABLE IF NOT EXISTS "fashion_colors" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "hex" TEXT NOT NULL DEFAULT '#111827',
  "swatchUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fashion_colors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "fashion_colors_tenantId_name_key" ON "fashion_colors"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "fashion_colors_tenantId_isActive_idx" ON "fashion_colors"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "product_bundle_components" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bundleProductId" TEXT NOT NULL,
  "componentVariantId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_bundle_components_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_bundle_components_bundleProductId_componentVariantId_key" ON "product_bundle_components"("bundleProductId", "componentVariantId");
CREATE INDEX IF NOT EXISTS "product_bundle_components_tenantId_idx" ON "product_bundle_components"("tenantId");
CREATE INDEX IF NOT EXISTS "product_bundle_components_componentVariantId_idx" ON "product_bundle_components"("componentVariantId");

CREATE TABLE IF NOT EXISTS "fitting_rooms" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fitting_rooms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "fitting_rooms_tenantId_branchId_code_key" ON "fitting_rooms"("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "fitting_rooms_tenantId_branchId_idx" ON "fitting_rooms"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "fitting_sessions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT,
  "staffUserId" TEXT,
  "status" "FittingSessionStatus" NOT NULL DEFAULT 'IN_FITTING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fitting_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fitting_sessions_tenantId_branchId_status_idx" ON "fitting_sessions"("tenantId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "fitting_sessions_roomId_idx" ON "fitting_sessions"("roomId");

CREATE TABLE IF NOT EXISTS "fitting_session_items" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fitting_session_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fitting_session_items_sessionId_idx" ON "fitting_session_items"("sessionId");
CREATE INDEX IF NOT EXISTS "fitting_session_items_variantId_idx" ON "fitting_session_items"("variantId");
