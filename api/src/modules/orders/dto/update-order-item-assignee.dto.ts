import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateOrderItemAssigneeDto {
  @ApiPropertyOptional({ description: 'Set to null to clear the assignee' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}
