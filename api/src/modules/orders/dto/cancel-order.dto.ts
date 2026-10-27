import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PIN_REGEX } from '../../../common/pin';

export class CancelOrderDto {
  @ApiProperty({ description: 'Required for audit, like a discount reason — a void with no record of why is a fraud vector' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ description: "A supervisor/manager's PIN — required when a cashier voids an order" })
  @IsOptional()
  @Matches(PIN_REGEX, { message: 'PIN must be 4 digits' })
  approverPin?: string;
}
