import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PIN_REGEX } from '../../../common/pin';

export class ApplyMemberDiscountDto {
  @ApiPropertyOptional({ description: "A supervisor/manager's PIN — only needed to stack the member discount on top of another discount" })
  @IsOptional()
  @IsString()
  @Matches(PIN_REGEX, { message: 'PIN must be 4 digits' })
  approverPin?: string;
}
