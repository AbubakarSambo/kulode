import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ReportsModule } from '../reports/reports.module';
import { ClientsModule } from '../clients/clients.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { PaymentsModule } from '../payments/payments.module';
import { VendorsModule } from '../vendors/vendors.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    ReportsModule,
    ClientsModule,
    InvoicesModule,
    ExpensesModule,
    PaymentsModule,
    VendorsModule,
    InventoryModule,
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
