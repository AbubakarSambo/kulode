import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config';
import { PrismaModule } from './modules/prisma';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { OrganizationsModule } from './modules/organizations';
import { ClientsModule } from './modules/clients';
import { InvoicesModule } from './modules/invoices';
import { PaymentsModule } from './modules/payments';
import { ExpensesModule } from './modules/expenses';
import { PaystackModule } from './modules/paystack';
import { ReportsModule } from './modules/reports';
import { VendorsModule } from './modules/vendors';
import { PlatformModule } from './modules/platform';
import { EmailModule } from './modules/email';
import { SubscriptionModule } from './modules/subscription';
import { InventoryModule } from './modules/inventory';
import { TaxModule } from './modules/tax';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AiModule } from './modules/ai/ai.module';
import { MenuModule } from './modules/menu';
import { TablesModule } from './modules/tables';
import { OrdersModule } from './modules/orders';
import { ShiftsModule } from './modules/shifts';
import { CustomersModule } from './modules/customers';
import { WalletModule } from './modules/wallet';
import { GoogleSheetsModule } from './modules/google-sheets';
import { SheetSyncModule } from './modules/sheet-sync';
import { PosReportsModule } from './modules/pos-reports';
import { PrintersModule } from './modules/printers';
import { OrderTypesModule } from './modules/order-types';
import { JwtAuthGuard, RolesGuard, GlobalExceptionFilter, TransformInterceptor, SubscriptionReadOnlyGuard } from './common';



@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ClientsModule,
    CustomersModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
    PaystackModule,
    ReportsModule,
    VendorsModule,
    PlatformModule,
    InventoryModule,
    SubscriptionModule,
    TaxModule,
    OnboardingModule,
    AiModule,
    MenuModule,
    TablesModule,
    OrdersModule,
    ShiftsModule,
    WalletModule,
    GoogleSheetsModule,
    SheetSyncModule,
    PosReportsModule,
    PrintersModule,
    OrderTypesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Roles Guard
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global Subscription Read-Only Guard
    {
      provide: APP_GUARD,
      useClass: SubscriptionReadOnlyGuard,
    },
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global Response Transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
