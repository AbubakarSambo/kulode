import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PosMode } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'NOON Daytime Bar' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  organizationName: string;

  @ApiPropertyOptional({ enum: PosMode, description: 'RESTAURANT (default) or RETAIL' })
  @IsOptional()
  @IsEnum(PosMode)
  posMode?: PosMode;
}
