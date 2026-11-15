import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Server-side product analytics for things the browser cannot see: Moniepoint webhooks, the print
 * agent, subscription charges and "first time" activation milestones. Events are attached to the
 * restaurant (the `organization` group) rather than a person, so they line up with the browser
 * events in PostHog's group analytics.
 *
 * Does nothing when POSTHOG_API_KEY is unset (local, tests). Every call is fire-and-forget and
 * swallows its own errors: analytics must never fail or slow a payment, an order or a print job.
 */
@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly client: PostHog | null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.POSTHOG_API_KEY;
    this.client = key
      ? new PostHog(key, { host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com', flushAt: 20, flushInterval: 10_000 })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  capture(organizationId: string, event: string, properties: Record<string, unknown> = {}): void {
    if (!this.client) return;
    try {
      this.client.capture({
        // One anonymous "actor" per restaurant; no person profile is created for it.
        distinctId: `org:${organizationId}`,
        event,
        properties: { ...properties, source: 'api', app_env: process.env.NODE_ENV, $process_person_profile: false },
        groups: { organization: organizationId },
      });
    } catch (err) {
      this.logger.warn(`Could not queue analytics event ${event}: ${(err as Error).message}`);
    }
  }

  /**
   * Fires `event` once, the first time something happens for an organization. `isFirst` runs only
   * when analytics is on and should return true when the row just created is the org's first
   * (e.g. a count of 1). Adds how long after signup it happened.
   */
  async milestone(organizationId: string, event: string, isFirst: () => Promise<boolean>): Promise<void> {
    if (!this.client) return;
    try {
      if (!(await isFirst())) return;
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true, posMode: true, planTier: true },
      });
      const daysSinceSignup = org ? Math.floor((Date.now() - org.createdAt.getTime()) / 86_400_000) : undefined;
      this.capture(organizationId, event, { days_since_signup: daysSinceSignup, pos_mode: org?.posMode, plan_tier: org?.planTier });
    } catch (err) {
      this.logger.warn(`Could not record milestone ${event}: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown().catch(() => undefined);
  }
}
