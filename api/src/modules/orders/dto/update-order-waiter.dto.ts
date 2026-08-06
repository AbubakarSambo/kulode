import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateOrderWaiterDto {
  @ApiPropertyOptional({ description: 'Set to null to clear the waiter link' })
  @IsOptional()
  @IsUUID()
  waiterId?: string | null;
}
