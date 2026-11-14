import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class HeldSaleLineDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class HoldSaleDto {
  @ApiProperty({ type: [HeldSaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => HeldSaleLineDto)
  items: HeldSaleLineDto[];

  @ApiPropertyOptional({ example: 'blue jacket', description: 'Tag so the customer can be found again in the held list' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ description: 'Wallet customer attached to the cart' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
