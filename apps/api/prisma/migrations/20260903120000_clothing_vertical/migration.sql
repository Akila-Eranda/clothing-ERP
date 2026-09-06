-- Clothing vertical enhancements (backward compatible)
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "season" TEXT;
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "collections_tenantId_idx" ON "collections"("tenantId");
CREATE INDEX IF NOT EXISTS "collections_tenantId_isActive_idx" ON "collections"("tenantId", "isActive");

ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "campaignKind" TEXT NOT NULL DEFAULT 'STANDARD';
CREATE INDEX IF NOT EXISTS "promotions_tenantId_campaignKind_idx" ON "promotions"("tenantId", "campaignKind");

-- COLOR_ISSUE for clothing returns (Prisma enum)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ReturnReason' AND e.enumlabel = 'COLOR_ISSUE'
  ) THEN
    ALTER TYPE "ReturnReason" ADD VALUE 'COLOR_ISSUE';
  END IF;
END $$;
