import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SubscriptionReadOnlyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

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

    // Fetch the organization subscription status
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        subscriptionStatus: true,
        trialEndDate: true,
        isGrandfathered: true,
      },
    });

    if (!org) {
      throw new ForbiddenException('Organization not found');
    }

    // Grandfathered organizations bypass all expiration checks
    if (org.isGrandfathered) {
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
