import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { VersionController } from './version.controller';
import { OrgGoLiveService } from './org-go-live.service';

@Module({
  controllers: [PlatformController, VersionController],
  providers: [PlatformService, OrgGoLiveService],
  exports: [PlatformService],
})
export class PlatformModule {}
