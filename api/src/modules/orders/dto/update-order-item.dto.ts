import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrderItemDto {
  @ApiProperty({ example: 2, description: 'New quantity for this line. 0 removes the item from the order.' })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ description: 'New note for this line — omit to leave it unchanged, empty string clears it' })
  @IsOptional()
  @IsString()
  notes?: string;
}
