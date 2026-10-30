import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common';

export class CustomerFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['owing'],
    description: 'owing = only customers whose wallet balance is negative, most owed first',
  })
  @IsOptional()
  @IsIn(['owing'])
  balance?: 'owing';
}
