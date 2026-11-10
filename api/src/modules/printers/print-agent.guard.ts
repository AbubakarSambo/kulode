import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const AGENT_HEARTBEAT_WRITE_MS = 30_000;
// An agent that hasn't polled for this long is shown as offline (three missed heartbeats).
export const AGENT_ONLINE_WINDOW_MS = 90_000;

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
      select: { id: true, name: true, printAgentLastSeenAt: true },
    });
    if (!organization) {
      throw new UnauthorizedException('Invalid print agent token');
    }

    // Heartbeat for the online/offline badge in Settings. The agent polls every couple of
    // seconds, so only write when the stamp is stale — and never let it fail the request.
    const lastSeen = organization.printAgentLastSeenAt?.getTime() ?? 0;
    if (Date.now() - lastSeen > AGENT_HEARTBEAT_WRITE_MS) {
      this.prisma.organization
        .update({ where: { id: organization.id }, data: { printAgentLastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    request.organizationId = organization.id;
    // Consumed by LoggingInterceptor so Railway logs show which org's agent is polling.
    request.organizationName = organization.name;
    return true;
  }
}
