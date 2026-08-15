import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, Matches } from 'class-validator';
import { PIN_REGEX } from '../../../common';

export class PinLoginDto {
  @ApiProperty({ description: 'Organization to look the PIN up against — cached on the device after the first email/password login there' })
  @IsNotEmpty()
  @IsUUID()
  organizationId: string;

  @ApiProperty({ example: '4821' })
  @Matches(PIN_REGEX, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}
