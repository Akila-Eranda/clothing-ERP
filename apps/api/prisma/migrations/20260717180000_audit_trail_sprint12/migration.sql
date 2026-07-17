-- Phase 06 Sprint 12 — Audit trail query indexes

CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_action_idx" ON "audit_logs"("tenantId", "action");
CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_resource_idx" ON "audit_logs"("tenantId", "resource");
CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");
