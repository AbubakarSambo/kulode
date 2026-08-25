import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class SetPrinterCategoriesDto {
  @ApiProperty({
    type: [String],
    description:
      'Menu category IDs this printer should receive dockets for. An empty array makes the printer a broadcast printer that receives every order.',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
