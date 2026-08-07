import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  MaxLength,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { OrgModule } from '@prisma/client';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'CleanTex' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'info@cleantex.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+234 123 456 7890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: '123 Main Street, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'INV' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  invoicePrefix?: string;

  @ApiPropertyOptional({ example: 7.5, description: 'Tax rate percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({ example: false, description: 'Enable VAT on invoices' })
  @IsOptional()
  @IsBoolean()
  vatEnabled?: boolean;

  @ApiPropertyOptional({ example: 'Payment due within 30 days of invoice date.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 'Thank you for your business!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultNotes?: string;

  @ApiPropertyOptional({ example: false, description: 'Show business address QR code on invoice PDF' })
  @IsOptional()
  @IsBoolean()
  showQrCode?: boolean;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logo?: string | null;

  @ApiPropertyOptional({ example: 'Freelance', description: 'Type of business' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessType?: string;

  @ApiPropertyOptional({ example: '2-10', description: 'Size of organization' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  organizationSize?: string;

  @ApiPropertyOptional({
    enum: OrgModule,
    example: 'INVOICING',
    description: 'Which feature modules (POS, invoicing, or both) this org has access to',
  })
  @IsOptional()
  @IsEnum(OrgModule)
  enabledModules?: OrgModule;

  @ApiPropertyOptional({ example: 'RC1234567', description: 'CAC registration number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rcNumber?: string;

  @ApiPropertyOptional({ example: '12345678-0001', description: 'Tax Identification Number (TIN)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tin?: string;

  @ApiPropertyOptional({
    example: '1yrBFrddzXGCuHWJF1X56-Y_wvZyO2JU-lK3yxCilibA',
    description: 'ID of the Google Sheet shared with our service account, for the Sheets sync',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  googleSheetId?: string | null;
}
