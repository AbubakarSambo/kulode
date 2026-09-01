import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from 'class-validator';

export class MoveOrderItemLineDto {
  @ApiProperty({ description: 'Order item id on the source order' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    description: 'How many units of this item to move — omit to move the item\'s full remaining quantity. ' +
      'Moving fewer than the full quantity splits the line: the moved units become a new item on the ' +
      'destination, and the source line keeps the rest.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}

export class MoveOrderItemsDto {
  @ApiProperty({ type: [MoveOrderItemLineDto], description: 'Items (and optionally partial quantities) to move off this order' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MoveOrderItemLineDto)
  items: MoveOrderItemLineDto[];

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
