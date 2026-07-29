import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateMenuItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
