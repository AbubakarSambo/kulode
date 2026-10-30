import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class AssignBarcodesDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Only these items (those that already have a barcode are skipped). Omit for every item without one.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  itemIds?: string[];
}
