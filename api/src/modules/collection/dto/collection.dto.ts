import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, Max } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Roles that take part in collection; same floor ladder the leaderboard draws from.
export const COLLECTION_ROLES = ['WAITER', 'CASHIER', 'SUPERVISOR', 'MANAGER'] as const;

export class CreateCollectionPeriodDto {
  @ApiProperty({ example: 'November phone drive' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '2026-11-08', description: 'Inclusive, in the organization timezone' })
  @Matches(DATE)
  startDate: string;

  @ApiProperty({ example: '2026-11-30' })
  @Matches(DATE)
  endDate: string;

  @ApiProperty({ example: ['WAITER'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(COLLECTION_ROLES, { each: true })
  rolesInScope: string[];

  @ApiProperty({ example: 140 })
  @IsInt()
  @Min(1)
  minimum: number;

  @ApiProperty({ example: 175 })
  @IsInt()
  @Min(1)
  threshold: number;

  @ApiPropertyOptional({ example: 40000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardAmount?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  deductionPct?: number;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  coverageGoalPct?: number;
}

export class UpdateCollectionPeriodDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Matches(DATE) endDate?: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(COLLECTION_ROLES, { each: true }) rolesInScope?: string[];
  @IsOptional() @IsInt() @Min(1) minimum?: number;
  @IsOptional() @IsInt() @Min(1) threshold?: number;
  @IsOptional() @IsNumber() @Min(0) rewardAmount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) deductionPct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) coverageGoalPct?: number;
}

export class SetOverrideDto {
  @ApiPropertyOptional({ description: 'Personal minimum (part-timers, late joiners)' })
  @IsOptional() @IsInt() @Min(1) minimum?: number;

  @ApiPropertyOptional({ description: 'Personal reward threshold' })
  @IsOptional() @IsInt() @Min(1) threshold?: number;

  @ApiPropertyOptional({ description: 'Numbers collected before TariOne could attribute them' })
  @IsOptional() @IsInt() @Min(0) openingCount?: number;
}

export class RevokeCreditDto {
  @ApiProperty({ example: 'Number was made up' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}

export class CollectionQueryDto {
  @ApiPropertyOptional({ description: 'Defaults to the open period (or the latest one)' })
  @IsOptional()
  @IsUUID()
  periodId?: string;
}

export class CreditsQueryDto extends CollectionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
