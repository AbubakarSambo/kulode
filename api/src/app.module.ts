import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
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
import { JwtAuthGuard, RolesGuard, GlobalExceptionFilter, TransformInterceptor } from './common';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ClientsModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
    PaystackModule,
    ReportsModule,
    VendorsModule,
    PlatformModule,
  ],
  providers: [
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
