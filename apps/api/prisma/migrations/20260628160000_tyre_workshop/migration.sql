-- Tyre shop workshop module: job cards, appointments, services, serial tracking

CREATE TYPE "TubeType" AS ENUM ('TUBE', 'TUBELESS');
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'INVOICED', 'CANCELLED');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "ServiceLineType" AS ENUM ('PART', 'LABOR', 'SERVICE');
CREATE TYPE "TyreSerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'CLAIMED');
CREATE TYPE "ServiceReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ServiceReminderChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tubeType" "TubeType";
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pattern" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "dotCode" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "isFleet" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "workshop_service_catalog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "defaultPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workshop_service_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "appointments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "customerVehicleId" TEXT,
  "appointmentNumber" TEXT NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "serviceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "job_cards" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "customerVehicleId" TEXT,
  "appointmentId" TEXT,
  "jobNumber" TEXT NOT NULL,
  "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN',
  "technicianId" TEXT,
  "odometer" INTEGER,
  "complaintNotes" TEXT,
  "beforeNotes" TEXT,
  "afterNotes" TEXT,
  "technicianNotes" TEXT,
  "customerSignature" TEXT,
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "saleId" TEXT,
  "quotationId" TEXT,
  "createdBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "job_card_lines" (
  "id" TEXT NOT NULL,
  "jobCardId" TEXT NOT NULL,
  "lineType" "ServiceLineType" NOT NULL DEFAULT 'SERVICE',
  "variantId" TEXT,
  "serviceCatalogId" TEXT,
  "description" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "job_card_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tyre_serials" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "dotCode" TEXT,
  "branchId" TEXT,
  "status" "TyreSerialStatus" NOT NULL DEFAULT 'IN_STOCK',
  "jobCardId" TEXT,
  "saleId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tyre_serials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_reminders" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerVehicleId" TEXT,
  "appointmentId" TEXT,
  "jobCardId" TEXT,
  "reminderType" TEXT NOT NULL DEFAULT 'SERVICE_DUE',
  "channel" "ServiceReminderChannel" NOT NULL DEFAULT 'SMS',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ServiceReminderStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_service_catalog_tenantId_code_key" ON "workshop_service_catalog"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_tenantId_appointmentNumber_key" ON "appointments"("tenantId", "appointmentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "job_cards_tenantId_jobNumber_key" ON "job_cards"("tenantId", "jobNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "job_cards_appointmentId_key" ON "job_cards"("appointmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "tyre_serials_tenantId_serialNumber_key" ON "tyre_serials"("tenantId", "serialNumber");

ALTER TABLE "workshop_service_catalog" ADD CONSTRAINT "workshop_service_catalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_serviceCatalogId_fkey" FOREIGN KEY ("serviceCatalogId") REFERENCES "workshop_service_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tyre_serials" ADD CONSTRAINT "tyre_serials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tyre_serials" ADD CONSTRAINT "tyre_serials_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
