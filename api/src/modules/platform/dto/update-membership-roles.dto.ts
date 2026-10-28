import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateMembershipRolesDto {
  @ApiProperty({ enum: UserRole, isArray: true, description: 'The full set of roles the user should hold in this organization' })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
