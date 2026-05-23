import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const requestId = uuidv4();

    let message: string | string[];
    let error: string;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      error = HttpStatus[status] || 'Unknown Error';
    } else if (typeof exceptionResponse === 'object') {
      const resp = exceptionResponse as Record<string, unknown>;
      message = (resp.message as string | string[]) || exception.message;
      error = (resp.error as string) || HttpStatus[status] || 'Unknown Error';
    } else {
      message = exception.message;
      error = HttpStatus[status] || 'Unknown Error';
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      method: request.method,
      requestId,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} ${status}`,
        exception.stack,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
