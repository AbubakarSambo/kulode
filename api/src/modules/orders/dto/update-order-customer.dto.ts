import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateOrderCustomerDto {
  @ApiPropertyOptional({ description: 'Set to null to clear the customer link' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ description: 'Why the customer is being changed on a paid order (required there when loyalty is on)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({ description: 'Supervisor/manager PIN, when the person making the change is below supervisor' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  approverPin?: string;
}
