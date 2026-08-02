import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, NotEquals } from 'class-validator';

export class AdjustWalletDto {
  @ApiProperty({
    description: 'Signed amount to apply to the balance — positive credits, negative debits',
  })
  @IsNumber()
  @NotEquals(0)
  amount: number;

  @ApiProperty({ description: 'Why this manual override was made — required for audit purposes' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Client-generated UUID for idempotent retries' })
  @IsUUID()
  clientRequestId: string;
}
