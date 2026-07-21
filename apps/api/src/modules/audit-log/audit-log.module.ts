import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

/**
 * Audit Engine — sole audit / activity trail boundary.
 *
 * Public API (via AuditLogService):
 * - log() / logActivity() / logClientEvent()
 * - findAll() / findAllPlatform() / getActionSummary()
 * - getLoginHistory() / getActivityLogs()
 *
 * Capture paths:
 * - HTTP writes → AuditInterceptor → log()
 * - Domain events → @OnEvent handlers → engine builders → log()
 * - Explicit domain calls (journals, periods, settings) → log()
 */
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}

/** Alias — Shared Audit Engine entrypoint. */
export { AuditLogService, AuditLogService as AuditEngine } from './audit-log.service';
export type { AuditLogPayload } from './audit-log.dto';
export { ClientAuditEventDto } from './audit-log.dto';
export {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LIST,
  normalizeJournalAuditAction,
  sanitizeAuditData,
  resolveAuditAction,
} from './audit-engine.helper';
