import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuCategoryKind } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Starters' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: MenuCategoryKind, default: MenuCategoryKind.FOOD })
  @IsOptional()
  @IsEnum(MenuCategoryKind)
  kind?: MenuCategoryKind;
}
