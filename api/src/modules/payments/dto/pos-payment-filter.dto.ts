import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common';

// Deliberately a plain string, not the PaymentMethod enum — POS payments use reserved literals
// (PAYSTACK/WALLET/MONIEPOINT_POS/MONIEPOINT_TRANSFER) and per-org PaymentType names, neither of
// which that enum covers (see Payment.paymentMethod in schema.prisma).
export class PosPaymentFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;
}
