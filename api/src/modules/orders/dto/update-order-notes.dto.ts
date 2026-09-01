import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderNotesDto {
  @ApiPropertyOptional({ description: 'Set to empty/omit to clear the notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
