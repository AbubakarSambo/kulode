import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class IntrospectMoniepointDto {
  @ApiProperty({ description: 'The mptp_... API key — used once to list the businesses it can access. Not stored by this call.' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  clientSecret: string;
}

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

  @ApiProperty({
    description:
      'Numeric business id (as a string — can exceed 32-bit int range), picked from POST organizations/moniepoint-introspect. Checked again on the server against the key\'s introspect result.',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+$/, { message: 'businessId must contain only digits' })
  businessId: string;
}
