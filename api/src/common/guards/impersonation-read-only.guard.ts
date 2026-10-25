import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// Exiting is the one write a "View as" session may make — it's what ends the session.
const ALLOWED_WRITE_PATH_SUFFIX = '/impersonation/exit';

// A platform admin viewing an org via "View as" sees exactly what its Super Admin sees, but can't
// change anything: many writes here have real-world side effects (a fired order prints in their
// kitchen, an invoice send/reminder emails or WhatsApps their client, closing an order or a shift
// lands in their cash-up under a stranger's name). Registered as an APP_GUARD after
// JwtAuthGuard, so request.user is already resolved.
@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user, method } = request;

    if (!user?.impersonationSessionId || ['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return true;
    }

    const path: string = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (path.endsWith(ALLOWED_WRITE_PATH_SUFFIX)) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      code: 'IMPERSONATION_READ_ONLY',
      message: "You're viewing this organization in read-only mode. Changes aren't allowed.",
    });
  }
}
