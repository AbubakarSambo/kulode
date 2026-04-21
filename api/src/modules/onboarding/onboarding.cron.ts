import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';
import { EmailService } from '../email/email.service';

@Injectable()
export class OnboardingCron {
  private readonly logger = new Logger(OnboardingCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async sendClientReminders() {
    this.logger.log('Running client reminder check...');

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orgs = await this.prisma.organization.findMany({
      where: {
        createdAt: { lte: cutoff },
        clientReminderSentAt: null,
        clients: { none: {} },
      },
      include: {
        users: {
          where: { role: 'SUPER_ADMIN', isActive: true },
          take: 1,
        },
      },
    });

    this.logger.log(`Found ${orgs.length} org(s) eligible for client reminder`);

    for (const org of orgs) {
      const owner = org.users[0];
      if (!owner) continue;

      try {
        await this.emailService.sendClientReminderEmail(owner.email, owner.firstName);
        await this.prisma.organization.update({
          where: { id: org.id },
          data: { clientReminderSentAt: new Date() },
        });
        this.logger.log(`Client reminder sent to ${owner.email} (org: ${org.id})`);
      } catch (err) {
        this.logger.error(`Failed to send client reminder for org ${org.id}: ${err.message}`);
      }
    }

    this.logger.log('Client reminder check complete.');
  }
}
