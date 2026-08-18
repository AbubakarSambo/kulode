import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

const ORDER_SOURCES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'THIRD_PARTY'] as const;

export class MoveOrderItemsDto {
  @ApiProperty({ type: [String], description: 'Item ids on this order to move off it' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  itemIds: string[];

  @ApiPropertyOptional({ description: 'Move onto this existing open order instead of creating a new one' })
  @IsOptional()
  @IsUUID()
  destinationOrderId?: string;

  @ApiPropertyOptional({ description: 'Only used when creating a new order — defaults to the source order\'s own table' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({ enum: ORDER_SOURCES, description: 'Only used when creating a new order — defaults to the source order\'s own type' })
  @IsOptional()
  @IsNotEmpty()
  @IsIn(ORDER_SOURCES)
  source?: (typeof ORDER_SOURCES)[number];
}
