import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { VersionController } from './version.controller';

@Module({
  controllers: [PlatformController, VersionController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
