import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { REQUIRES_PLAN_KEY } from '../decorators/plan.decorator';

const PLAN_HIERARCHY: Record<string, number> = { FREE: 0, STARTER: 1, PRO: 2, BUSINESS: 3 };

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlans = this.reflector.getAllAndOverride<string[]>(REQUIRES_PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPlans || requiredPlans.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Platform admins bypass all plan checks
    if (user.isPlatformAdmin) {
      return true;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        planTier: true,
        subscriptionStatus: true,
        trialEndDate: true,
        subscriptionEndDate: true,
        isGrandfathered: true,
      },
    });

    if (!org) {
      throw new ForbiddenException('Organization not found');
    }

    // Grandfathered orgs bypass all checks
    if (org.isGrandfathered) {
      return true;
    }

    // Compute effective plan
    let effectivePlan = org.planTier;
    const now = new Date();

    if (
      org.subscriptionStatus === 'TRIALING' &&
      org.trialEndDate &&
      now > org.trialEndDate
    ) {
      effectivePlan = 'FREE';
    }
    if (org.subscriptionStatus === 'EXPIRED') {
      effectivePlan = 'FREE';
    }
    if (org.subscriptionStatus === 'CANCELLED') {
      // Keep current plan if subscription end date hasn't passed yet
      if (org.subscriptionEndDate && now > org.subscriptionEndDate) {
        effectivePlan = 'FREE';
      }
    }

    const effectiveLevel = PLAN_HIERARCHY[effectivePlan] ?? 0;
    const minRequired = Math.min(...requiredPlans.map((p) => PLAN_HIERARCHY[p] ?? 0));

    if (effectiveLevel < minRequired) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: requiredPlans[0],
        currentPlan: effectivePlan,
        message: `This feature requires a ${requiredPlans[0]} plan or higher`,
      });
    }

    return true;
  }
}
