import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { MAX_TIP_PRESETS } from '../../../common/tip-rules';

export class UpdateTipSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Whole-Naira quick-pick amounts shown at checkout', type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TIP_PRESETS)
  @IsInt({ each: true })
  @Min(100, { each: true })
  @Max(1_000_000, { each: true })
  presets?: number[];
}

export class TipOwedQueryDto {
  @ApiPropertyOptional({ description: 'First business date to report on (YYYY-MM-DD, org timezone). Defaults to today.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Last business date, inclusive. Defaults to `from`.' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class RecordTipPayoutDto {
  @ApiPropertyOptional({ description: 'Waiter being paid. Omit for the unassigned pool.' })
  @IsOptional()
  @IsUUID()
  waiterId?: string;

  @ApiProperty({ description: 'Amount paid out, in Naira. May not exceed the balance owed.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: ['CASH_DRAWER', 'BANK'], description: 'Where the money came from — a till payout lowers expected cash at shift close.' })
  @IsEnum({ CASH_DRAWER: 'CASH_DRAWER', BANK: 'BANK' })
  paidFrom: 'CASH_DRAWER' | 'BANK';

  @ApiPropertyOptional({ description: 'Supervisor/manager PIN. Required unless the signed-in user is a supervisor or above.' })
  @IsOptional()
  @IsString()
  approverPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ description: 'Client-generated UUID so a double-tap cannot pay twice' })
  @IsUUID()
  clientRequestId: string;
}

export class TipLedgerQueryDto {
  @ApiPropertyOptional({ description: 'Omit for the unassigned pool' })
  @IsOptional()
  @IsUUID()
  waiterId?: string;
}
