import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Jollof Rice' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Smoky party jollof with fried plantain' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 3500 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'Link to an inventory item for stock deduction on order close' })
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Expected kitchen prep time in minutes, used for the kitchen ticket countdown timer', example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMinutes?: number;
}
