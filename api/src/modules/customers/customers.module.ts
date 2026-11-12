import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PhoneCaptureService } from './phone-capture.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PhoneCaptureService],
  exports: [CustomersService, PhoneCaptureService],
})
export class CustomersModule {}
