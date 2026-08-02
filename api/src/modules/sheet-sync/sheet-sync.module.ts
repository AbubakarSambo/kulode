import { Module } from '@nestjs/common';
import { SheetSyncService } from './sheet-sync.service';
import { SheetSyncCron } from './sheet-sync.cron';
import { GoogleSheetsModule } from '../google-sheets';

@Module({
  imports: [GoogleSheetsModule],
  providers: [SheetSyncService, SheetSyncCron],
  exports: [SheetSyncService],
})
export class SheetSyncModule {}
