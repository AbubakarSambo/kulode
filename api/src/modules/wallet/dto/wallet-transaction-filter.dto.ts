import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common';

const WALLET_TRANSACTION_TYPES = ['TOPUP', 'ORDER_DEBIT', 'REFUND', 'ADJUSTMENT'] as const;

export class WalletTransactionFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WALLET_TRANSACTION_TYPES })
  @IsOptional()
  @IsIn(WALLET_TRANSACTION_TYPES)
  type?: (typeof WALLET_TRANSACTION_TYPES)[number];
}
