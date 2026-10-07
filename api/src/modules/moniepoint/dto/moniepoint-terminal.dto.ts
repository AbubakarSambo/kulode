import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMoniepointTerminalDto {
  @ApiProperty({ description: "Serial number of the physical terminal, from the restaurant's Moniepoint dashboard" })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  serial: string;

  @ApiProperty({ description: 'A name staff will recognize, e.g. "Front Counter" or "Bar"' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  label: string;
}

export class UpdateMoniepointTerminalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ description: 'Set false to hide a decommissioned terminal from the picker without losing its transaction history' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
