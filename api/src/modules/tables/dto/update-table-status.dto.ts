import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'NEEDS_CLEANING'] as const;

export class UpdateTableStatusDto {
  @ApiProperty({ enum: TABLE_STATUSES })
  @IsIn(TABLE_STATUSES)
  status: (typeof TABLE_STATUSES)[number];
}
