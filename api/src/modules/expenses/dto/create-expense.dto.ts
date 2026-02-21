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
}
