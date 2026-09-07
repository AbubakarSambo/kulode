import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BackdateShiftDto {
  @ApiProperty({ example: '2026-09-06T18:00:00.000Z', description: 'The past instant the shift should have been opened at' })
  @IsDateString()
  openedAt: string;

  @ApiPropertyOptional({ example: 10000, description: 'Starting cash float in the till' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingFloat?: number;

  @ApiPropertyOptional({ description: 'Staff member to credit as having opened the shift — defaults to the admin performing this action' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({ description: 'Optional note explaining why this shift was opened retroactively' })
  @IsOptional()
  @IsString()
  notes?: string;
}
