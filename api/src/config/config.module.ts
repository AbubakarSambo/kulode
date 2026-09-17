import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig, resendConfig, paystackConfig, moniepointConfig, googleConfig, googleSheetsConfig, whatsappConfig, accountingFeedConfig } from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, resendConfig, paystackConfig, moniepointConfig, googleConfig, googleSheetsConfig, whatsappConfig, accountingFeedConfig],
      envFilePath: ['.env.local', '.env'],
    }),
  ],
})
export class ConfigModule {}
