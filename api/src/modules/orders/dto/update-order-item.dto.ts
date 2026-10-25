import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { PIN_REGEX } from '../../../common/pin';

export class UpdateOrderItemDto {
  @ApiProperty({ example: 2, description: 'New quantity for this line. 0 removes the item from the order.' })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'New note for this line — omit to leave it unchanged, empty string clears it' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "A supervisor/manager's PIN — required when someone below supervisor reduces or removes an item (it's already on a kitchen docket)",
  })
  @IsOptional()
  @Matches(PIN_REGEX, { message: 'PIN must be 4 digits' })
  approverPin?: string;
}
