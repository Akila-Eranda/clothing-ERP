-- HRM master data: departments, designations, holidays, leave types + shift extensions

CREATE TABLE IF NOT EXISTS "hr_departments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hr_departments_tenantId_name_key" ON "hr_departments"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "hr_departments_tenantId_idx" ON "hr_departments"("tenantId");

CREATE TABLE IF NOT EXISTS "hr_designations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hr_designations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hr_designations_tenantId_name_key" ON "hr_designations"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "hr_designations_tenantId_idx" ON "hr_designations"("tenantId");

ALTER TABLE "hr_designations" DROP CONSTRAINT IF EXISTS "hr_designations_departmentId_fkey";
ALTER TABLE "hr_designations" ADD CONSTRAINT "hr_designations_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "hr_holidays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hr_holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hr_holidays_tenantId_startDate_idx" ON "hr_holidays"("tenantId", "startDate");

CREATE TABLE IF NOT EXISTS "hr_leave_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 14,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hr_leave_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hr_leave_types_tenantId_name_key" ON "hr_leave_types"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "hr_leave_types_tenantId_idx" ON "hr_leave_types"("tenantId");

ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "weekOff" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "shifts_tenantId_idx" ON "shifts"("tenantId");
