import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentUser, CurrentUserData } from '../../common';
import { CollectionService } from './collection.service';
import {
  CollectionQueryDto,
  CreateCollectionPeriodDto,
  CreditsQueryDto,
  RevokeCreditDto,
  SetOverrideDto,
  UpdateCollectionPeriodDto,
} from './dto';

@ApiTags('Phone collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(private readonly collection: CollectionService) {}

  @Get('leaderboard')
  @ApiOperation({ summary: 'Phone Numbers leaderboard for a collection period (everyone sees the whole board)' })
  @Can('COLLECTION_VIEW')
  leaderboard(@CurrentUser() user: CurrentUserData, @Query() query: CollectionQueryDto) {
    return this.collection.getLeaderboard(user, query.periodId);
  }

  @Get('periods')
  @ApiOperation({ summary: 'All collection periods with per-person overrides (admin)' })
  @Can('COLLECTION_CONFIGURE')
  periods(@CurrentUser('organizationId') organizationId: string) {
    return this.collection.listPeriods(organizationId);
  }

  @Post('periods')
  @ApiOperation({ summary: 'Create a collection period (admin)' })
  @Can('COLLECTION_CONFIGURE')
  createPeriod(@CurrentUser('organizationId') organizationId: string, @Body() dto: CreateCollectionPeriodDto) {
    return this.collection.createPeriod(organizationId, dto);
  }

  @Patch('periods/:id')
  @ApiOperation({ summary: 'Edit an open collection period (admin)' })
  @Can('COLLECTION_CONFIGURE')
  updatePeriod(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionPeriodDto,
  ) {
    return this.collection.updatePeriod(organizationId, id, dto);
  }

  @Put('periods/:id/overrides/:userId')
  @ApiOperation({ summary: 'Set a person\'s own target and/or opening count for a period (admin)' })
  @Can('COLLECTION_CONFIGURE')
  setOverride(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetOverrideDto,
  ) {
    return this.collection.setOverride(organizationId, id, userId, dto);
  }

  @Get('periods/:id/outcome')
  @ApiOperation({ summary: 'Period outcome per person: final count, zone, incentive due or deduction flag (manager+). Provisional until the period is locked.' })
  @Can('COLLECTION_OUTCOME')
  outcome(@CurrentUser('organizationId') organizationId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.collection.getOutcome(organizationId, id);
  }

  @Get('periods/:id/outcome.csv')
  @ApiOperation({ summary: 'Period outcome as a CSV for payroll (manager+). TariOne flags the outcome; payroll applies the money.' })
  @Can('COLLECTION_OUTCOME')
  async outcomeCsv(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.collection.outcomeCsv(organizationId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Post('periods/:id/lock')
  @ApiOperation({ summary: 'Lock an ended period now and freeze its outcome (admin). The hourly job does this automatically.' })
  @Can('COLLECTION_CONFIGURE')
  lock(@CurrentUser('organizationId') organizationId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.collection.lockPeriod(organizationId, id);
  }

  @Get('credits')
  @ApiOperation({ summary: 'Phone-number credits for a period, newest first (manager+), for review and revoking' })
  @Can('PHONE_CREDIT_REVOKE')
  credits(@CurrentUser('organizationId') organizationId: string, @Query() query: CreditsQueryDto) {
    return this.collection.listCredits(organizationId, query.periodId, query.userId);
  }

  @Post('credits/:id/revoke')
  @ApiOperation({ summary: 'Revoke a credit with a reason (manager+); revoked credits drop out of the count' })
  @Can('PHONE_CREDIT_REVOKE')
  revoke(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeCreditDto) {
    return this.collection.revokeCredit(user, id, dto.reason);
  }
}
