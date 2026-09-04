import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

// Logs one line per request once the response has actually finished sending — `finish` fires
// with the real status code whether the handler succeeded or the GlobalExceptionFilter took
// over, unlike hooking rxjs around next.handle() (which sees a success value or a thrown error,
// not the response Nest eventually sends). Railway's log viewer is the intended consumer: no
// per-route latency dashboard there, but `path=X` is greppable and shows durationMs per hit.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, originalUrl } = request;
    const start = Date.now();

    response.on('finish', () => {
      const durationMs = Date.now() - start;
      // Populated by JwtAuthGuard/passport for authenticated routes; absent on @Public() ones
      // (login, webhooks) — omitted rather than logged as "undefined".
      const organizationId = request.user?.organizationId;
      const orgSuffix = organizationId ? ` org=${organizationId}` : '';
      this.logger.log(`${method} ${originalUrl} ${response.statusCode} ${durationMs}ms${orgSuffix}`);
    });

    return next.handle();
  }
}
