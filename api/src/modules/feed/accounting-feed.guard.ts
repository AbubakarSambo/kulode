import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

// Authenticates C.R.E.A.M. (and any other external accounting consumer) against a single
// platform-wide shared secret — not a per-org token, since this feed reads across every org
// that has opted in (see Organization.isAccountingFeedEnabled), not just one tenant. Modeled
// after PrintAgentGuard, but comparing against a static config secret instead of a DB lookup.
@Injectable()
export class AccountingFeedGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>('accountingFeed.secret');
    if (!secret) {
      // Fail closed: an unset secret must never be treated as "no auth required".
      throw new ServiceUnavailableException('Accounting feed is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (!token || !this.tokensMatch(token, secret)) {
      throw new UnauthorizedException('Invalid or missing accounting feed token');
    }

    return true;
  }

  private tokensMatch(token: string, secret: string): boolean {
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(secret);
    // Constant-time comparison, and only once lengths match (timingSafeEqual throws on
    // mismatched lengths rather than returning false).
    if (tokenBuf.length !== secretBuf.length) {
      return false;
    }
    return timingSafeEqual(tokenBuf, secretBuf);
  }
}
