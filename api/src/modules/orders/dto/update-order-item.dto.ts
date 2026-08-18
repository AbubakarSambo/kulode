import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateOrderItemDto {
  @ApiProperty({ example: 2, description: 'New quantity for this line. 0 removes the item from the order.' })
  @IsNumber()
  @Min(0)
  quantity: number;
}
