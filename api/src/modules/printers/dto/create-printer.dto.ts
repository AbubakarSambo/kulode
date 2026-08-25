import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrinterConnectionType } from '@prisma/client';
import { IsEnum, IsIP, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// ipAddress is intentionally optional here even for NETWORK printers — finding a printer's LAN
// IP (self-test page, router lookup, etc.) is its own separate task, so admins need to be able
// to register "Kitchen Printer, Network" now and fill the address in once they've tracked it
// down. An unconfigured printer just surfaces as "not configured" in the UI instead of blocking
// docket dispatch outright (see PrintingService — jobs for it fail loud, not silently).

export class CreatePrinterDto {
  @ApiProperty({ example: 'Kitchen Printer' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Kitchen', description: 'Freeform station label, e.g. Kitchen, Bar, Expo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  station: string;

  @ApiPropertyOptional({ enum: PrinterConnectionType, default: PrinterConnectionType.NETWORK })
  @IsOptional()
  @IsEnum(PrinterConnectionType)
  connectionType?: PrinterConnectionType;

  // Only validated as an IP *if provided* — see the note above for why it isn't required.
  @ApiPropertyOptional({ example: '192.168.1.50' })
  @ValidateIf((o) => !!o.ipAddress)
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 9100, default: 9100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  // For USB/BLUETOOTH — the Windows share name the print agent copies raw bytes to (the printer
  // must be shared in Windows first). Optional for the same "add now, configure later" reason
  // as ipAddress above.
  @ApiPropertyOptional({ example: 'XP80C' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  devicePath?: string;
}
