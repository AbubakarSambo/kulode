import { Module } from '@nestjs/common';
import { MaintenanceCron } from './maintenance.cron';

@Module({
  providers: [MaintenanceCron],
})
export class MaintenanceModule {}
