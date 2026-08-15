import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common';

const ORDER_STATUSES = ['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_PAID', 'CLOSED_UNPAID', 'CANCELLED'] as const;

export class OrderFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional({
    enum: ORDER_STATUSES,
    isArray: true,
    description: 'Match any of these statuses — e.g. the kitchen board fetching OPEN+IN_KITCHEN+READY in one request instead of three',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsIn(ORDER_STATUSES, { each: true })
  statuses?: (typeof ORDER_STATUSES)[number][];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  waiterId?: string;
}
