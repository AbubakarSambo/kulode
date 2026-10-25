import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartImpersonationDto {
  @ApiProperty({ description: 'Organization to view as its Super Admin (read-only)' })
  @IsNotEmpty()
  @IsUUID()
  organizationId: string;

  @ApiPropertyOptional({ description: 'Why the session was started — kept on the audit record' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
