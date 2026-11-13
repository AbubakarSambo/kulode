import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ENROL_SOURCES = ['ORDER', 'PAY', 'QUICK_ADD', 'CUSTOMER_FORM'] as const;
export type EnrolSource = (typeof ENROL_SOURCES)[number];

export class RewardRuleDto {
  @ApiPropertyOptional({ description: 'Existing rule to edit; omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Meal Reward' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 100000, description: 'Lifetime spend per reward' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  thresholdAmount: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  repeating: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Most redeemable on one order; omit for no limit' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerOrder?: number | null;

  @ApiPropertyOptional({ example: 2700 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  foodCost?: number;

  @ApiProperty({ description: 'Menu items the customer picks from when redeeming' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  menuItemIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MemberDiscountDto {
  @ApiPropertyOptional({ description: 'Existing discount to edit; omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Event space' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 7.5, description: 'Percentage off (0.01–100)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  ratePct: number;

  @ApiProperty({ description: 'Menu items it applies to' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  menuItemIds: string[];

  @ApiProperty({ description: 'Whole menu categories it applies to' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  categoryIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLoyaltySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiryDays?: number;

  @ApiPropertyOptional({ type: [RewardRuleDto], description: 'The full list of rules; any existing rule left out is deactivated' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RewardRuleDto)
  rules?: RewardRuleDto[];

  @ApiPropertyOptional({ type: [MemberDiscountDto], description: 'The full list of member discounts; any existing one left out is deactivated' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MemberDiscountDto)
  discounts?: MemberDiscountDto[];
}

export class EnrolMemberDto {
  @ApiPropertyOptional({ description: 'Existing customer to enrol' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: '08031234569', description: 'Required when no customerId, or the customer has no number yet' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: 'Required unless the customer already has a real name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Staff confirm the customer agreed to receive loyalty messages' })
  @IsBoolean()
  consent: boolean;

  @ApiProperty({ enum: ENROL_SOURCES })
  @IsIn(ENROL_SOURCES)
  source: EnrolSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Idempotency key for the number capture, if one is made' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
