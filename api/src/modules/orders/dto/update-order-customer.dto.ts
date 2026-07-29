import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateOrderCustomerDto {
  @ApiPropertyOptional({ description: 'Set to null to clear the customer link' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;
}
