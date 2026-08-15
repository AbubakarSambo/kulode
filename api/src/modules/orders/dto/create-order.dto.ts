import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const ORDER_SOURCES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'THIRD_PARTY'] as const;

export class CreateOrderItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional({ example: 'No pepper' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'Required for DINE_IN orders' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  waiterId?: string;

  @ApiPropertyOptional({ enum: ORDER_SOURCES, default: 'DINE_IN' })
  @IsOptional()
  @IsIn(ORDER_SOURCES)
  source?: (typeof ORDER_SOURCES)[number];

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Apply VAT to this order. Defaults to the org setting when omitted; has no effect if the org hasn\'t enabled VAT.' })
  @IsOptional()
  @IsBoolean()
  applyVat?: boolean;

  @ApiPropertyOptional({ description: 'Apply entertainment/consumption tax to this order. Defaults to the org setting when omitted; has no effect if the org hasn\'t enabled it.' })
  @IsOptional()
  @IsBoolean()
  applyEntertainmentTax?: boolean;

  @ApiProperty({ description: 'Client-generated UUID for idempotent retries (e.g. from the offline queue)' })
  @IsNotEmpty()
  @IsUUID()
  clientRequestId: string;
}
