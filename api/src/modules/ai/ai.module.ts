import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PosAiController } from './pos-ai.controller';
import { PosAiDataService } from './pos-ai-data.service';
import { ReportsModule } from '../reports/reports.module';
import { ClientsModule } from '../clients/clients.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { PaymentsModule } from '../payments/payments.module';
import { VendorsModule } from '../vendors/vendors.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { CustomersModule } from '../customers/customers.module';
import { PosReportsModule } from '../pos-reports/pos-reports.module';

@Module({
  imports: [
    ReportsModule,
    ClientsModule,
    InvoicesModule,
    ExpensesModule,
    PaymentsModule,
    VendorsModule,
    InventoryModule,
    OrdersModule,
    ShiftsModule,
    CustomersModule,
    PosReportsModule,
  ],
  controllers: [AiController, PosAiController],
  providers: [AiService, PosAiDataService],
})
export class AiModule {}
