import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignUnreconciledTransferDto {
  @ApiProperty({ description: 'The order this transfer should be applied to' })
  @IsNotEmpty()
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({ description: 'Record whatever the transfer is over the amount due as a tip for the order\'s waiter' })
  @IsOptional()
  @IsBoolean()
  excessAsTip?: boolean;

  @ApiPropertyOptional({ description: 'Set once an unusually large tip (over ₦20,000 or half the bill) has been confirmed' })
  @IsOptional()
  @IsBoolean()
  tipConfirmed?: boolean;
}

export class IgnoreUnreconciledTransferDto {
  @ApiPropertyOptional({ description: 'Why this transfer isn\'t for any order (e.g. unrelated to the till)' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResolveToWalletUnreconciledTransferDto {
  @ApiProperty({ description: "The customer whose wallet this transfer's amount should be credited to" })
  @IsNotEmpty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Optional note on the wallet top-up (e.g. sender detail that identified the customer)' })
  @IsOptional()
  @IsString()
  notes?: string;
}
