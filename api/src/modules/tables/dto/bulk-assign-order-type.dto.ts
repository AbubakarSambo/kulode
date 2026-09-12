import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class BulkAssignOrderTypeDto {
  @ApiProperty({ type: [String], description: 'Table ids to assign — typically every table in one section' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  tableIds: string[];

  @ApiPropertyOptional({ description: 'Order type to assign. Omit/null to clear the mapping on these tables.' })
  @IsOptional()
  @IsUUID()
  orderTypeId?: string | null;
}
