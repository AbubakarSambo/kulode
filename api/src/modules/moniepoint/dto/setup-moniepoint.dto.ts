import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
      'Numeric business id (as a string — can exceed 32-bit int range) required to register the webhook subscription. Usually not needed here — we try to auto-detect it via GET /v1/introspect when subscribing. Only set this if that auto-detection fails.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'businessId must contain only digits' })
  businessId?: string;
}
