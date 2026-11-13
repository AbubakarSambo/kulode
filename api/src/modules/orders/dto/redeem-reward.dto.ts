import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RedeemRewardDto {
  @ApiProperty({ description: 'The member\'s available reward to use' })
  @IsUUID()
  rewardId: string;

  @ApiProperty({ description: 'Which of the reward\'s eligible items the customer chose' })
  @IsUUID()
  menuItemId: string;
}
