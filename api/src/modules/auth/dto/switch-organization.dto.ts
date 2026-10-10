import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SwitchOrganizationDto {
  @ApiProperty({ description: 'Organization to switch the active session into — must be one the user already has a membership in' })
  @IsNotEmpty()
  @IsUUID()
  organizationId: string;
}
