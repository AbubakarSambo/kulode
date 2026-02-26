import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ enum: ['RESTOCK', 'ADJUSTMENT'], description: 'RESTOCK = add stock, ADJUSTMENT = write-off' })
  @IsIn(['RESTOCK', 'ADJUSTMENT'])
  type: 'RESTOCK' | 'ADJUSTMENT';

  @ApiProperty({ example: 5, description: 'Quantity to add (RESTOCK) or remove (ADJUSTMENT). Always positive.' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional({ example: 'Received from supplier' })
  @IsOptional()
  @IsString()
  notes?: string;
}
