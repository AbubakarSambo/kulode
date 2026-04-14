import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsEnum, IsArray, ArrayNotEmpty, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../../common';
import { TaxCategory } from './create-expense.dto';

export class ExpenseFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ enum: TaxCategory })
  @IsOptional()
  @IsEnum(TaxCategory)
  taxCategory?: TaxCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  isDeductible?: boolean;
}

export class BulkRecategorizeDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  ids: string[];

  @ApiPropertyOptional({ enum: TaxCategory })
  @IsEnum(TaxCategory)
  taxCategory: TaxCategory;
}
