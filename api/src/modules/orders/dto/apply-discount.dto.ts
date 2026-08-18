import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'] as const;

export class ApplyDiscountDto {
  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  discountType: (typeof DISCOUNT_TYPES)[number];

  @ApiProperty({ description: 'A percentage (0-100) or a fixed currency amount, depending on discountType. 0 clears an existing discount.' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ description: 'Required for audit — an unrestricted till-side discount is a fraud vector' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}

export { DISCOUNT_TYPES };
