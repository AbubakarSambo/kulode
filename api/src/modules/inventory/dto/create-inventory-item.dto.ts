import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitOfMeasure } from '@prisma/client';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Chocolate Cake (6-inch)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Rich chocolate sponge with ganache' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({
    enum: UnitOfMeasure,
    example: UnitOfMeasure.UNIT,
    description: 'What onHandQuantity/reorderLevel and any recipe line against this item are counted in',
  })
  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @ApiPropertyOptional({ example: 10, description: 'Starting stock quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStock?: number;

  @ApiPropertyOptional({ example: 3, description: 'Alert when available quantity falls to or below this level' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @ApiPropertyOptional({ example: 'CAKE-CHOC-6IN' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;
}
