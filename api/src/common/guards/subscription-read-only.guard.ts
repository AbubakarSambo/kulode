import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface OrgSubscriptionFields {
  subscriptionStatus: string;
  trialEndDate: Date | null;
  isGrandfathered: boolean;
  businessType: string | null;
}

@Injectable()
export class SubscriptionReadOnlyGuard implements CanActivate {
  // This guard is registered as an APP_GUARD, so it runs on every non-GET request app-wide — an
  // uncached lookup here added a full DB round trip to every single write (e.g. a kitchen ticket
  // status tap). Subscription status changes rarely, so a short cache is a safe trade: up to this
  // many seconds of staleness after an expiry/renewal, in exchange for skipping that round trip on
  // nearly every mutating request. The instance is a singleton (default Nest scope), so this Map is
  // shared across all requests, not per-request.
  private static readonly CACHE_TTL_MS = 30_000;
  private cache = new Map<string, { org: OrgSubscriptionFields; expiresAt: number }>();

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  private async getOrgSubscriptionFields(organizationId: string): Promise<OrgSubscriptionFields | null> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.org;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        subscriptionStatus: true,
        trialEndDate: true,
        isGrandfathered: true,
        businessType: true,
      },
    });
    if (org) {
      this.cache.set(organizationId, { org, expiresAt: Date.now() + SubscriptionReadOnlyGuard.CACHE_TTL_MS });
    }
    return org;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user, method, url } = request;

    // If not authenticated or it's a safe/read-only HTTP method, allow it
    if (!user || ['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return true;
    }

    // Platform admins bypass all plan/subscription checks
    if (user.isPlatformAdmin) {
      return true;
    }

    // Whitelist path segments related to authentication, subscription upgrading, and payment hooks
    const isAllowedWriteRoute =
      url.includes('/auth/') ||
      url.includes('/subscription/') ||
      url.includes('/paystack/') ||
      url.includes('/billing/');

    if (isAllowedWriteRoute) {
      return true;
    }

    // Fetch the organization subscription status (briefly cached — see getOrgSubscriptionFields)
    const org = await this.getOrgSubscriptionFields(user.organizationId);

    if (!org) {
      throw new ForbiddenException('Organization not found');
    }

    // Grandfathered organizations bypass all expiration checks
    if (org.isGrandfathered) {
      return true;
    }

    // Orgs that haven't finished the initial personalization step yet must be able to
    // complete onboarding even if the trial expired before they got to it, otherwise
    // they're permanently stuck unable to set up their account or reach billing.
    if (!org.businessType) {
      return true;
    }

    const now = new Date();
    const isExpired =
      org.subscriptionStatus === 'EXPIRED' ||
      (org.subscriptionStatus === 'TRIALING' && org.trialEndDate && now > org.trialEndDate);

    if (isExpired) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUBSCRIPTION_EXPIRED_READ_ONLY',
        message: 'Your subscription has expired. The system is in read-only mode. Please renew your subscription to perform this action.',
      });
    }

    return true;
  }
}
