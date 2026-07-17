-- Phase 02 Sprint 3: Journal Entries
DO $$ BEGIN
  CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "voidedBy" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

-- Existing posted journals → POSTED
UPDATE "journal_entries" SET "status" = 'POSTED', "postedAt" = COALESCE("postedAt", "createdAt")
WHERE "isPosted" = true AND ("status" = 'DRAFT' OR "status" IS NULL);

CREATE INDEX IF NOT EXISTS "journal_entries_tenantId_status_idx" ON "journal_entries"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "journal_entries_tenantId_date_idx" ON "journal_entries"("tenantId", "date");
