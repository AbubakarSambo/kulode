import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

const ORDER_SOURCES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'THIRD_PARTY'] as const;

export class UpdateOrderSourceDto {
  @ApiProperty({ enum: ORDER_SOURCES })
  @IsIn(ORDER_SOURCES)
  source: (typeof ORDER_SOURCES)[number];

  @ApiPropertyOptional({ description: 'Required when switching to DINE_IN; ignored/cleared for any other source' })
  @IsOptional()
  @IsUUID()
  tableId?: string;
}
