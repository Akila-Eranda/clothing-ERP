import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const tenantId = request.headers['x-tenant-id'] as string;
    const userAgent = request.headers['user-agent'] || '';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode;
          const duration = Date.now() - start;
          this.logger.log(
            `${method} ${url} ${statusCode} ${duration}ms | IP: ${ip} | Tenant: ${tenantId || 'N/A'} | UA: ${userAgent.slice(0, 50)}`,
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - start;
          this.logger.error(
            `${method} ${url} ERROR ${duration}ms | ${error.message}`,
          );
        },
      }),
    );
  }
}
