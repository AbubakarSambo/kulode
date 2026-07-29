import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { CreateOrderItemDto } from './create-order.dto';

export class AddOrderItemsDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ description: 'Client-generated UUID for idempotent retries (e.g. from the offline queue)' })
  @IsNotEmpty()
  @IsUUID()
  clientRequestId: string;
}
