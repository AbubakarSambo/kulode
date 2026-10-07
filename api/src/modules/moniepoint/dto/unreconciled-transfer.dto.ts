import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignUnreconciledTransferDto {
  @ApiProperty({ description: 'The order this transfer should be applied to' })
  @IsNotEmpty()
  @IsUUID()
  orderId: string;
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
