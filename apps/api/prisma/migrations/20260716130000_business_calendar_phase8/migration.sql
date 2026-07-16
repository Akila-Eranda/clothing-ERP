-- Phase 8 Business Calendar: notes, tasks, meetings

DO $$ BEGIN CREATE TYPE "CalendarTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "calendar_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "color" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "calendar_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CalendarTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "createdBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "calendar_meetings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_meetings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "calendar_notes_tenantId_date_idx" ON "calendar_notes"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "calendar_tasks_tenantId_date_idx" ON "calendar_tasks"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "calendar_tasks_tenantId_status_idx" ON "calendar_tasks"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "calendar_meetings_tenantId_startsAt_idx" ON "calendar_meetings"("tenantId", "startsAt");

DO $$ BEGIN
  ALTER TABLE "calendar_notes" ADD CONSTRAINT "calendar_notes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_meetings" ADD CONSTRAINT "calendar_meetings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
