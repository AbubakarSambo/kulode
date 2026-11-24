import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_SEND_HOUR, MIN_SEND_HOUR, SCHEDULE_TEMPLATE_LABELS } from '../invoice-collections.schedule';

export class ScheduleStepDto {
  @ApiProperty({ example: -2, description: 'Days from the invoice due date (negative = before)' })
  @IsInt()
  @Min(-30)
  @Max(90)
  offsetDays: number;

  @ApiProperty({ enum: SCHEDULE_TEMPLATE_LABELS })
  @IsIn(SCHEDULE_TEMPLATE_LABELS)
  template: (typeof SCHEDULE_TEMPLATE_LABELS)[number];
}

/** Every field is optional: the first call enrols the business with defaults, later calls change only what is sent. */
export class UpdateCollectionPolicyDto {
  @ApiPropertyOptional({ type: [ScheduleStepDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScheduleStepDto)
  schedule?: ScheduleStepDto[];

  @ApiPropertyOptional({ enum: ['APPROVE', 'AUTO'], description: 'APPROVE = owner taps approve on each reminder' })
  @IsOptional()
  @IsIn(['APPROVE', 'AUTO'])
  mode?: 'APPROVE' | 'AUTO';

  @ApiPropertyOptional({ example: 9, description: 'Local hour reminders go out (7 to 20)' })
  @IsOptional()
  @IsInt()
  @Min(MIN_SEND_HOUR)
  @Max(MAX_SEND_HOUR)
  sendHour?: number;

  @ApiPropertyOptional({ example: 4, description: 'Most reminders sent per invoice' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxMessages?: number;

  @ApiPropertyOptional({ description: 'Pause every reminder for this business' })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}
