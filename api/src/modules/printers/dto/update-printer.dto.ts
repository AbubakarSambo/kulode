import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrinterConnectionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIP, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

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

  // Set when a printer is added from the agent's scan results; never typed by hand.
  @ApiPropertyOptional({ example: 'a4:5e:60:c1:22:9b' })
  @IsOptional()
  @Matches(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)
  macAddress?: string;

  // Send customer bills/receipts to this printer through the print agent.
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  printsBills?: boolean;

  @ApiPropertyOptional({ enum: [58, 80], default: 80 })
  @IsOptional()
  @IsIn([58, 80])
  paperWidthMm?: number;
}
