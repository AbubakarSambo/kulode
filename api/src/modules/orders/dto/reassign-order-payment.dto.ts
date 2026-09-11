import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ReassignOrderPaymentDto {
  @ApiProperty({ description: 'Customer who should actually have been charged for this order' })
  @IsUUID()
  toCustomerId: string;

  @ApiProperty({ description: 'Why this correction was made — required for audit purposes' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Client-generated UUID for idempotent retries' })
  @IsUUID()
  clientRequestId: string;
}
