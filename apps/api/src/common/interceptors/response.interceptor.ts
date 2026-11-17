import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { stripSensitiveFields } from '@/shared/security/sensitive-fields';

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string;
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((raw) => {
        // File downloads (Excel / PDF) go out as-is; wrapping them in JSON would corrupt the file.
        if (raw instanceof StreamableFile) return raw as unknown as ApiResponse<T>;
        // Never let credential fields (password / 2FA / PIN hashes) leave the API.
        const data = stripSensitiveFields(raw);
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return data as ApiResponse<T>;
        }

        return {
          success: true,
          statusCode,
          data,
          timestamp: new Date().toISOString(),
          ...(requestId && { requestId }),
        };
      }),
    );
  }
}
