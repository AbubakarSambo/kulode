import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateCustomerCreditDto {
  @ApiProperty({ example: 5000, description: 'Max the wallet may go negative by. 0 revokes credit.' })
  @IsNumber()
  @Min(0)
  creditLimit: number;
}
