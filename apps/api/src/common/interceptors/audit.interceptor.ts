import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string; tenantId: string };
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const AUDIT_PATHS = ['/users', '/roles', '/products', '/inventory', '/customers', '/sales'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url, body, ip } = request;
    const user = request.user;

    const shouldAudit =
      user &&
      WRITE_METHODS.includes(method) &&
      AUDIT_PATHS.some((p) => url.includes(p));

    if (!shouldAudit) return next.handle();

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          this.prisma.auditLog
            .create({
              data: {
                tenantId: user.tenantId,
                userId: user.id,
                action: method,
                resource: url.split('/')[3] || url,
                newData: responseData as any,
                ipAddress: ip,
                userAgent: request.headers['user-agent'],
              },
            })
            .catch(() => {});
        },
      }),
    );
  }
}
