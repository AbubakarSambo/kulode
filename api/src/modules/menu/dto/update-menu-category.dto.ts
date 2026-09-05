import { ApiPropertyOptional } from '@nestjs/swagger';
import { MenuCategoryKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateMenuCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: MenuCategoryKind })
  @IsOptional()
  @IsEnum(MenuCategoryKind)
  kind?: MenuCategoryKind;
}
