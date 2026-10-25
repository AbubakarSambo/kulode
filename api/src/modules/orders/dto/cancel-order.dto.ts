import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { PIN_REGEX } from '../../../common/pin';

export class CancelOrderDto {
  @ApiPropertyOptional({ description: "A supervisor/manager's PIN — required when a cashier voids an order" })
  @IsOptional()
  @Matches(PIN_REGEX, { message: 'PIN must be 4 digits' })
  approverPin?: string;
}
