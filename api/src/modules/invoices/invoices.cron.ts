import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleOverdueCheck() {
    this.logger.log('Running daily overdue invoice check...');
    await this.invoicesService.markOverdueInvoices();
    this.logger.log('Overdue invoice check complete.');
  }
}
