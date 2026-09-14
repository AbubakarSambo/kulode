import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetWebhookSecretDto {
  @ApiProperty({ description: 'Webhook secret copied from the subscription\'s menu in the Moniepoint dashboard — shown only once, not returned by the create-subscription API call' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  webhookSecret: string;
}
