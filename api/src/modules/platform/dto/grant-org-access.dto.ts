import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsUUID, IsOptional, IsArray, IsEnum, ArrayNotEmpty } from 'class-validator';

export class GrantOrgAccessDto {
  @ApiProperty({ description: 'Organization to grant the user access to' })
  @IsUUID()
  organizationId: string;

  @ApiPropertyOptional({
    enum: UserRole,
    isArray: true,
    description: 'Roles the user should hold in the target organization. Defaults to their current roles in their primary org.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];
}
