import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePaymentTypeDto {
  @ApiProperty({ example: 'POS Terminal - GTBank' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'A comp: counts as settled but is kept out of sales' })
  @IsOptional()
  @IsBoolean()
  isComplimentary?: boolean;
}
