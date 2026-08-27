import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateOrderSourceDto {
  @ApiProperty({ description: 'Name of an active OrderType for this org' })
  @IsString()
  @IsNotEmpty()
  source: string;

  @ApiPropertyOptional({ description: 'Required when switching to a table-requiring type; ignored/cleared otherwise' })
  @IsOptional()
  @IsUUID()
  tableId?: string;
}
