import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier, SubscriptionStatus, OrgModule } from '@prisma/client';
import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class UpdatePlatformOrgDto {
  @ApiPropertyOptional({ enum: PlanTier, example: PlanTier.PRO })
  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: PlanTier;

  @ApiPropertyOptional({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isGrandfathered?: boolean;

  @ApiPropertyOptional({ example: 1.5, description: 'Custom platform fee percentage (0.00 to 100.00)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePercent?: number;

  @ApiPropertyOptional({
    enum: OrgModule,
    example: OrgModule.INVOICING,
    description: 'Which feature modules (POS, invoicing, or both) this org has access to',
  })
  @IsOptional()
  @IsEnum(OrgModule)
  enabledModules?: OrgModule;

  @ApiPropertyOptional({
    example: false,
    description: 'Internal/QA org — excluded from platform-admin analytics (GMV, org counts, top orgs, etc.)',
  })
  @IsOptional()
  @IsBoolean()
  isTestAccount?: boolean;
}
