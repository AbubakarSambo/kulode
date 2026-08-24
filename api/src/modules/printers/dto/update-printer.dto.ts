import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrinterConnectionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIP, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdatePrinterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  station?: string;

  @ApiPropertyOptional({ enum: PrinterConnectionType })
  @IsOptional()
  @IsEnum(PrinterConnectionType)
  connectionType?: PrinterConnectionType;

  // Optional — see CreatePrinterDto for why. Only validated as an IP *if provided*.
  @ApiPropertyOptional({ example: '192.168.1.50' })
  @ValidateIf((o) => !!o.ipAddress)
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 9100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'XP80C' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  devicePath?: string;
}
