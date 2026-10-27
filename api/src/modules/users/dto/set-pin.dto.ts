import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { PIN_REGEX } from '../../../common';

export class SetPinDto {
  @ApiProperty({ example: '4821', description: '4-digit quick-login PIN' })
  @Matches(PIN_REGEX, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}

export class SetOwnPinDto extends SetPinDto {
  @ApiProperty({ description: "The caller's current password — re-confirmed so an unattended signed-in session can't be used to plant a PIN" })
  @IsNotEmpty()
  @IsString()
  password: string;
}
