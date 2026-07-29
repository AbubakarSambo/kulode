import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

const ORDER_STATUSES = ['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_PAID', 'CLOSED_UNPAID', 'CANCELLED'] as const;

export class OrderFilterDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;
}
