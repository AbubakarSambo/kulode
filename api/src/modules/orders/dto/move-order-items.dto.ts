import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Name of an active OrderType for this org — only used when creating a new order — defaults to the source order\'s own type' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  source?: string;
}
