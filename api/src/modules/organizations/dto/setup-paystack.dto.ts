import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetupPaystackDto {
  @ApiProperty({ example: '058', description: 'Bank code from Paystack' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  bankCode: string;

  @ApiProperty({ example: '0123456789', description: 'Bank account number' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  accountNumber: string;
}

export class VerifyAccountResponseDto {
  @ApiProperty()
  accountNumber: string;

  @ApiProperty()
  accountName: string;

  @ApiProperty()
  bankCode: string;
}
