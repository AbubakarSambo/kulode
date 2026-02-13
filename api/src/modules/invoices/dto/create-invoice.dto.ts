import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsDate,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  IsOptional,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export class CreateInstallmentDto {
  @ApiProperty({ example: 'First Payment' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiProperty({ example: 75, description: 'Percentage of total (1-100)' })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage: number;
}

export class CreateInvoiceItemDto {
  @ApiProperty({ example: 'Carpet cleaning - living room' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 'uuid-of-client' })
  @IsNotEmpty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ example: '2026-02-15' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  issueDate: Date;

  @ApiProperty({ example: '2026-03-01' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  dueDate: Date;

  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @ApiPropertyOptional({ example: 10, description: 'Discount percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ 
    type: [CreateInstallmentDto],
    description: 'Payment installments. If provided, percentages must add up to 100.',
    example: [{ label: 'First Payment', percentage: 75 }, { label: 'Final Payment', percentage: 25 }]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInstallmentDto)
  installments?: CreateInstallmentDto[];

  @ApiPropertyOptional({ example: 'Thank you for your business!' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Payment due within 14 days' })
  @IsOptional()
  @IsString()
  terms?: string;
}
