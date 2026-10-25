import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;
    // Machine-readable reason some guards attach (IMPERSONATION_READ_ONLY,
    // SUBSCRIPTION_EXPIRED_READ_ONLY, PLAN_UPGRADE_REQUIRED, ...) so the client can tell one 403
    // apart from another without matching on message text.
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || message;
        errors = responseObj.errors || null;
        code = typeof responseObj.code === 'string' ? responseObj.code : undefined;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    // Report unexpected failures only — a validation error or a 404 is expected client-facing
    // behavior, not a bug. Nest catches exceptions inside the request pipeline before they'd ever
    // reach Sentry's own automatic process-level handlers, so this filter has to report them itself.
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(code && { code }),
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
