import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { PIN_REGEX } from '../../../common';

export class SetPinDto {
  @ApiProperty({ example: '4821', description: '4-digit quick-login PIN' })
  @Matches(PIN_REGEX, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}
