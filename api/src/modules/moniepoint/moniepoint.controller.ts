import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Headers,
  Req,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MoniepointService } from './moniepoint.service';
import { SetupMoniepointDto, PushPaymentDto, SetWebhookSecretDto } from './dto';
import { CurrentUser, Public, Roles, Role } from '../../common';

@ApiTags('Moniepoint POS')
@Controller()
export class MoniepointController {
  private readonly logger = new Logger(MoniepointController.name);

  constructor(private readonly moniepointService: MoniepointService) {}

  @Post('organizations/setup-moniepoint')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: "Store this restaurant's own Moniepoint POS credentials (clientId/clientSecret/terminalSerial)" })
  @ApiResponse({ status: 201, description: 'Credentials saved' })
  async setup(
    @Body() dto: SetupMoniepointDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.moniepointService.setupCredentials(organizationId, dto);
  }

  @Get('organizations/moniepoint-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Moniepoint POS setup status' })
  @ApiResponse({ status: 200, description: 'Moniepoint POS status' })
  async getStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.moniepointService.getStatus(organizationId);
  }

  @Delete('organizations/moniepoint')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Remove stored Moniepoint POS credentials' })
  @ApiResponse({ status: 200, description: 'Credentials removed' })
  async disconnect(@CurrentUser('organizationId') organizationId: string) {
    return this.moniepointService.disconnect(organizationId);
  }

  @Post('orders/:id/moniepoint-push')
  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ACCOUNTANT, Role.CASHIER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Push the order's amount to the restaurant's Moniepoint POS terminal" })
  @ApiResponse({ status: 201, description: 'Push queued to terminal' })
  async pushPayment(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: PushPaymentDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.moniepointService.pushOrderPayment(organizationId, orderId, dto.amount);
  }

  @Post('organizations/moniepoint-subscribe-webhook')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Register this org\'s webhook URL with Moniepoint (POST /v1/webhook-subscriptions) — run once after setup' })
  @ApiResponse({ status: 201, description: 'Webhook subscription created' })
  async subscribeWebhook(@CurrentUser('organizationId') organizationId: string) {
    return this.moniepointService.subscribeToWebhook(organizationId);
  }

  @Post('organizations/moniepoint-webhook-secret')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Store the webhook secret copied from the Moniepoint dashboard after creating the subscription' })
  @ApiResponse({ status: 201, description: 'Webhook secret saved' })
  async setWebhookSecret(
    @Body() dto: SetWebhookSecretDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.moniepointService.setWebhookSecret(organizationId, dto.webhookSecret);
  }

  @Get('moniepoint-transactions/:reference')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll the status of a pushed Moniepoint POS transaction' })
  @ApiResponse({ status: 200, description: 'Transaction status' })
  async getTransactionStatus(
    @Param('reference') reference: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.moniepointService.getTransactionStatus(organizationId, reference);
  }

  // TODO(security): the signature check runs and logs computed-vs-received (see
  // MoniepointService.processIncomingWebhook), but does NOT reject on mismatch — the exact
  // signed-string format is an educated guess pending confirmation against a real delivery.
  // Once confirmed/corrected, this must start rejecting mismatches with 400. Right now this
  // endpoint does not actually enforce anything — see the SECURITY GAP note on
  // MoniepointService.handleWebhookEvent.
  @Post('webhooks/moniepoint')
  @Public()
  @ApiOperation({ summary: 'Moniepoint POS transaction webhook (signature logged, not yet enforced — see TODO)' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Headers('moniepoint-webhook-id') webhookId: string,
    @Headers('moniepoint-webhook-timestamp') timestamp: string,
    @Headers('moniepoint-webhook-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);
    this.logger.log(`Received Moniepoint webhook: id=${webhookId ?? 'unknown'}`);
    return this.moniepointService.processIncomingWebhook(rawBody, webhookId, timestamp, signature);
  }
}
