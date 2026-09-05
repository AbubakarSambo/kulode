import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'Free-text search matched against the order\'s short id code, customer name, and staff name (the assigned waiter, or whoever created the order).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Return a lightweight projection (id, tableId, status, total, waiter/createdBy names) instead of the full order graph — for list views (e.g. the table floor board) that only need a few scalar fields rather than items/menuItem/payments/customer.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  summary?: boolean;
}
