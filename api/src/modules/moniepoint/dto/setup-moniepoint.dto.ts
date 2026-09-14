import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Integer business id required to register the webhook subscription. Usually not needed here — we try to read it out of the OAuth access token\'s own claims when subscribing. Only set this if that auto-detection fails.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  businessId?: number;
}
