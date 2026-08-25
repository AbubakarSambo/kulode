import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Authenticates the on-premise print agent (not a logged-in user) via a bearer token scoped to
// one organization. Used instead of the normal JWT guard on the /print-agent/* routes — see
// PrintAgentController — since the agent is an unattended background process with no user
// session, only the org-wide token an admin generated from Settings.
@Injectable()
export class PrintAgentGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing print agent token');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { printAgentToken: token },
      select: { id: true },
    });
    if (!organization) {
      throw new UnauthorizedException('Invalid print agent token');
    }

    request.organizationId = organization.id;
    return true;
  }
}
