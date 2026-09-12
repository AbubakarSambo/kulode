import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { REQUIRES_MODULE_KEY } from '../decorators/module.decorator';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<string[]>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Platform admins bypass all module checks
    if (user.isPlatformAdmin) {
      return true;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { enabledModules: true },
    });

    if (!org) {
      throw new ForbiddenException('Organization not found');
    }

    const hasAccess = requiredModules.some((m) => org.enabledModules === 'BOTH' || org.enabledModules === m);

    if (!hasAccess) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MODULE_NOT_ENABLED',
        message: `This feature requires the ${requiredModules[0]} module`,
      });
    }

    return true;
  }
}
