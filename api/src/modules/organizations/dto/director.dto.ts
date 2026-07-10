import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsBoolean, IsInt } from 'class-validator';

export class CreateDirectorDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsString()
  @MaxLength(255)
  forenames: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsString()
  @MaxLength(255)
  surname: string;

  @ApiPropertyOptional({ example: 'Jonathan Doey', description: 'Former name, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  formerName?: string;

  @ApiPropertyOptional({ example: false, description: 'Whether the director is not Nigerian' })
  @IsOptional()
  @IsBoolean()
  isNonNigerian?: boolean;

  @ApiPropertyOptional({ example: 'British', description: 'Required only if isNonNigerian is true' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateDirectorDto extends PartialType(CreateDirectorDto) {}
