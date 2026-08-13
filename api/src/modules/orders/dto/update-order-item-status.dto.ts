import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const ORDER_ITEM_STATUSES = ['PENDING', 'ON_IT', 'PASS', 'SERVED'] as const;

export class UpdateOrderItemStatusDto {
  @ApiProperty({ enum: ORDER_ITEM_STATUSES })
  @IsIn(ORDER_ITEM_STATUSES)
  status: (typeof ORDER_ITEM_STATUSES)[number];
}
