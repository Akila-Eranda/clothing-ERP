-- Fashion ERP platform ops tables (admin feature parity)
-- Apply with: npx prisma migrate deploy  OR  prisma db push

-- Enums
DO $$ BEGIN
  CREATE TYPE "FeatureSuggestionStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FeatureSuggestionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FeatureSuggestionHistoryAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'RESPONSE_UPDATED', 'NOTE_UPDATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "platform_announcements" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'INFO',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "target" TEXT NOT NULL DEFAULT 'ALL',
  "targetTenants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "dismissible" BOOLEAN NOT NULL DEFAULT true,
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "seenCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL DEFAULT 'Admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "platform_announcements_status_createdAt_idx" ON "platform_announcements"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "announcement_dismissals" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "platform_announcements"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_dismissals_userId_announcementId_key" ON "announcement_dismissals"("userId", "announcementId");

CREATE TABLE IF NOT EXISTS "platform_releases" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "releaseDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "popupEnabled" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "targetType" TEXT NOT NULL DEFAULT 'ALL',
  "targetPlans" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetTenants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetBranches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "imageUrl" TEXT,
  "videoUrl" TEXT,
  "docUrl" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'Admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "platform_release_items" (
  "id" TEXT PRIMARY KEY,
  "releaseId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "module" TEXT,
  "featureName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "badge" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "videoUrl" TEXT,
  "docUrl" TEXT,
  CONSTRAINT "platform_release_items_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_releases"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "tenant_release_reads" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "tenant_release_reads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_release_reads_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_releases"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_release_reads_tenantId_releaseId_key" ON "tenant_release_reads"("tenantId", "releaseId");

CREATE TABLE IF NOT EXISTS "feature_suggestions" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "FeatureSuggestionStatus" NOT NULL DEFAULT 'NEW',
  "priority" "FeatureSuggestionPriority" NOT NULL DEFAULT 'MEDIUM',
  "publicResponse" TEXT,
  "internalNote" TEXT,
  "respondedByEmail" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_suggestions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "feature_suggestions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "feature_suggestion_history" (
  "id" TEXT PRIMARY KEY,
  "suggestionId" TEXT NOT NULL,
  "action" "FeatureSuggestionHistoryAction" NOT NULL,
  "oldStatus" "FeatureSuggestionStatus",
  "newStatus" "FeatureSuggestionStatus",
  "oldPriority" "FeatureSuggestionPriority",
  "newPriority" "FeatureSuggestionPriority",
  "publicResponse" TEXT,
  "performedByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_suggestion_history_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "feature_suggestions"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "support_notes" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL DEFAULT 'Admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
