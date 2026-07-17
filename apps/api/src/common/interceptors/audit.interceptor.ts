import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditLogService } from '@/modules/audit-log/audit-log.module';
import {
  extractAuditResource,
  sanitizeAuditData,
  shouldAuditHttpRequest,
  resolveAuditAction,
} from '@/modules/audit-log/audit.helper';

interface AuthenticatedRequest extends Request {
  user?: { id: string; tenantId: string };
}

/**
 * Phase 06 Sprint 12 — Global write-path audit interceptor.
 * Logs Create / Update / Delete / Approvals / Print / Export across modules.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, originalUrl, url, body, ip } = request;
    const path = originalUrl || url || '';
    const user = request.user;

    if (!user?.tenantId || !shouldAuditHttpRequest(method, path)) {
      return next.handle();
    }

    const action = resolveAuditAction(method, path);
    if (!action) return next.handle();

    const { resource, resourceId } = extractAuditResource(path);
    const safeBody = sanitizeAuditData(body);

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          const idFromResponse =
            responseData &&
            typeof responseData === 'object' &&
            'id' in (responseData as object)
              ? String((responseData as { id: unknown }).id)
              : undefined;

          void this.audit.log({
            tenantId: user.tenantId,
            userId: user.id,
            action,
            resource,
            resourceId: resourceId ?? idFromResponse,
            newData: safeBody ?? sanitizeAuditData(
              responseData && typeof responseData === 'object'
                ? { id: (responseData as { id?: unknown }).id }
                : undefined,
            ),
            ipAddress: ip,
            userAgent: request.headers['user-agent'],
          });
        },
      }),
    );
  }
}
