import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MoniepointService } from './moniepoint.service';
import { SetupMoniepointDto, PushPaymentDto } from './dto';
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

  // TODO(security): confirm Moniepoint's webhook signature/secret mechanism with their
  // integration support and enforce it here before this goes anywhere near production — see the
  // SECURITY GAP note on MoniepointService.handleWebhookEvent. Right now this endpoint has no
  // way to prove a request actually came from Moniepoint.
  @Post('webhooks/moniepoint')
  @Public()
  @ApiOperation({ summary: 'Moniepoint POS transaction webhook (signature verification not yet implemented — see TODO)' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(@Body() body: { merchantReference: string; status: 'SUCCESS' | 'FAILED'; failureReason?: string }) {
    this.logger.log(`Received Moniepoint webhook: ref=${body?.merchantReference ?? 'unknown'}, status=${body?.status ?? 'unknown'}`);
    return this.moniepointService.handleWebhookEvent(body);
  }
}
