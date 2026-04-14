import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export enum TaxCategory {
  RENT = 'RENT',
  SALARIES = 'SALARIES',
  UTILITIES = 'UTILITIES',
  MARKETING = 'MARKETING',
  TRANSPORT = 'TRANSPORT',
  PROFESSIONAL_FEES = 'PROFESSIONAL_FEES',
  LOAN_INTEREST = 'LOAN_INTEREST',
  CAPITAL_ASSETS = 'CAPITAL_ASSETS',
  NON_DEDUCTIBLE = 'NON_DEDUCTIBLE',
  UNCATEGORIZED = 'UNCATEGORIZED',
}

export const DEDUCTIBLE_CATEGORIES = new Set<TaxCategory>([
  TaxCategory.RENT,
  TaxCategory.SALARIES,
  TaxCategory.UTILITIES,
  TaxCategory.MARKETING,
  TaxCategory.TRANSPORT,
  TaxCategory.PROFESSIONAL_FEES,
  TaxCategory.LOAN_INTEREST,
  TaxCategory.CAPITAL_ASSETS,
  TaxCategory.UNCATEGORIZED,
]);

export class CreateExpenseDto {
  @ApiProperty({ example: 'Cleaning supplies for January' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ example: 25000 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '2026-01-30' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  expenseDate: Date;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-vendor' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ example: 'ABC Supplies Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  recipient?: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.BANK_TRANSFER })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'TRF-987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ example: 'Monthly supply restock' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: TaxCategory, example: TaxCategory.UTILITIES })
  @IsOptional()
  @IsEnum(TaxCategory)
  taxCategory?: TaxCategory;
}
