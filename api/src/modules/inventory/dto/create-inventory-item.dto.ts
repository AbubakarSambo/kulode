import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsOptional,
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
