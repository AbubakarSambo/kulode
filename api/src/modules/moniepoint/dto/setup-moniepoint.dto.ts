import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetupMoniepointDto {
  @ApiProperty({ description: 'clientId generated from the restaurant\'s own Moniepoint business console (ERP integration)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  clientId: string;

  @ApiProperty({ description: 'clientSecret paired with clientId — stored encrypted, never returned by any GET endpoint' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  clientSecret: string;

  @ApiProperty({ description: 'Serial number of the physical terminal to push payments to, from the restaurant\'s Moniepoint dashboard' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  terminalSerial: string;
}
