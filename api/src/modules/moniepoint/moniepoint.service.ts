import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { encryptSecret, decryptSecret } from '../../common';
import { SetupMoniepointDto } from './dto';

// Mirrors OrdersService's PAYABLE_STATUSES — an order can still take a payment push while
// OPEN/IN_KITCHEN/READY, or once a waiter has handed it to a cashier via markAwaitingPayment
// (CLOSED_UNPAID).
const PAYABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
  OrderStatus.CLOSED_UNPAID,
];

// How long before its real expiry we treat a cached OAuth token as stale, so we never fire a
// push with a token that expires mid-flight.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface MoniepointAuthResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class MoniepointService {
  private readonly logger = new Logger(MoniepointService.name);
  private readonly baseUrl: string;
  private readonly encryptionKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {
    this.baseUrl = this.configService.get<string>('moniepoint.baseUrl') || 'https://channel.moniepoint.com';
    this.encryptionKey = this.configService.get<string>('moniepoint.encryptionKey') || '';
  }

  private get isMockMode(): boolean {
    return this.configService.get<boolean>('moniepoint.mockMode') === true;
  }

  private async makeRequest<T>(endpoint: string, body: unknown, accessToken?: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new BadRequestException(data?.message || `Moniepoint API error (${response.status})`);
      }
      return data as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Moniepoint API request to ${endpoint} failed`, error);
      throw new InternalServerErrorException('Failed to communicate with Moniepoint');
    }
  }

  /**
   * Restaurant self-onboarding: they enable ERP integration on their own Moniepoint business
   * console, generate a clientId/clientSecret scoped to their business, and copy their
   * terminal's serial — none of this comes from Tarione. Overwrites any previous credentials
   * and drops the cached token, since it was minted for the old clientId/clientSecret pair.
   */
  async setupCredentials(organizationId: string, dto: SetupMoniepointDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointClientId: dto.clientId,
        moniepointClientSecretEncrypted: encryptSecret(dto.clientSecret, this.encryptionKey),
        moniepointTerminalSerial: dto.terminalSerial,
        moniepointAccessToken: null,
        moniepointAccessTokenExpiresAt: null,
      },
    });

    return { success: true };
  }

  async getStatus(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { moniepointClientId: true, moniepointTerminalSerial: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      isSetup: !!(organization.moniepointClientId && organization.moniepointTerminalSerial),
      terminalSerial: organization.moniepointTerminalSerial,
    };
  }

  async disconnect(organizationId: string) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointClientId: null,
        moniepointClientSecretEncrypted: null,
        moniepointTerminalSerial: null,
        moniepointAccessToken: null,
        moniepointAccessTokenExpiresAt: null,
      },
    });

    return { success: true };
  }

  private async getAccessToken(organizationId: string, clientId: string, clientSecretEncrypted: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { moniepointAccessToken: true, moniepointAccessTokenExpiresAt: true },
    });

    if (
      organization?.moniepointAccessToken &&
      organization.moniepointAccessTokenExpiresAt &&
      organization.moniepointAccessTokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now()
    ) {
      return organization.moniepointAccessToken;
    }

    const clientSecret = decryptSecret(clientSecretEncrypted, this.encryptionKey);
    const auth = await this.makeRequest<MoniepointAuthResponse>('/v1/auth', { clientId, clientSecret });

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointAccessToken: auth.accessToken,
        moniepointAccessTokenExpiresAt: new Date(Date.now() + auth.expiresIn * 1000),
      },
    });

    return auth.accessToken;
  }

  /**
   * Pushes the order's amount to the restaurant's own physical terminal — the customer then
   * taps/inserts their card on that device. Returns immediately once Moniepoint has queued the
   * transaction (202 Accepted); actual success/failure only arrives later via webhook (see
   * handleWebhookEvent), or — in mock mode — a simulated timer standing in for that webhook.
   */
  async pushOrderPayment(organizationId: string, orderId: string, amount?: number) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!this.isMockMode && (!organization.moniepointClientId || !organization.moniepointClientSecretEncrypted || !organization.moniepointTerminalSerial)) {
      throw new BadRequestException('Moniepoint POS is not set up for this organization');
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot push payment for a ${order.status.toLowerCase()} order`);
    }

    const existingPending = await this.prisma.moniepointTransaction.findFirst({
      where: { orderId, status: 'PENDING' },
    });
    if (existingPending) {
      throw new BadRequestException('A payment push is already pending for this order — wait for it to complete or fail before retrying');
    }

    const pushAmount = amount ?? Number(order.total) - Number(order.amountPaid);
    const terminalSerial = organization.moniepointTerminalSerial || 'MOCK-TERMINAL';
    const merchantReference = `MNP-${order.id.slice(0, 8)}-${Date.now()}`;

    const transaction = await this.prisma.moniepointTransaction.create({
      data: {
        organizationId,
        orderId,
        merchantReference,
        terminalSerial,
        amount: pushAmount,
        status: 'PENDING',
      },
    });

    if (this.isMockMode) {
      this.logger.log(`[MOCK] Simulating Moniepoint POS push for order ${orderId} (ref ${merchantReference})`);
      setTimeout(() => {
        this.handleWebhookEvent({ merchantReference, status: 'SUCCESS' }).catch((err) =>
          this.logger.error(`Mock Moniepoint completion failed for ${merchantReference}: ${err.message}`),
        );
      }, 5000);
      return { merchantReference, status: transaction.status, amount: pushAmount };
    }

    try {
      const accessToken = await this.getAccessToken(organizationId, organization.moniepointClientId!, organization.moniepointClientSecretEncrypted!);
      await this.makeRequest(
        '/v1/transactions',
        {
          terminalSerial,
          amount: Math.round(pushAmount),
          merchantReference,
          transactionType: 'PURCHASE',
        },
        accessToken,
      );
    } catch (error) {
      await this.prisma.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() },
      });
      throw error;
    }

    return { merchantReference, status: transaction.status, amount: pushAmount };
  }

  async getTransactionStatus(organizationId: string, merchantReference: string) {
    const transaction = await this.prisma.moniepointTransaction.findFirst({
      where: { merchantReference, organizationId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  /**
   * Handles a completion notification for a pushed transaction — from a real Moniepoint webhook,
   * or the mock-mode simulator above.
   *
   * SECURITY GAP: Moniepoint's public docs did not expose the webhook payload schema or a
   * signature/secret verification mechanism for this endpoint (unlike Paystack's
   * x-paystack-signature HMAC — see PaystackService.verifyWebhookSignature). Until that's
   * confirmed with Moniepoint's integration support, this endpoint has NO way to prove a request
   * actually came from Moniepoint, and MUST NOT be trusted in production as-is. Whatever
   * verification they specify needs to be enforced in the controller before this method runs.
   */
  async handleWebhookEvent(payload: { merchantReference: string; status: 'SUCCESS' | 'FAILED'; failureReason?: string }) {
    const { merchantReference, status, failureReason } = payload;

    const transaction = await this.prisma.moniepointTransaction.findUnique({ where: { merchantReference } });
    if (!transaction) {
      this.logger.warn(`Moniepoint webhook for unknown reference ${merchantReference}`);
      return { received: true, reason: 'Unknown reference' };
    }
    if (transaction.status !== 'PENDING') {
      this.logger.log(`Moniepoint transaction ${merchantReference} already resolved (${transaction.status}), skipping.`);
      return { received: true, alreadyProcessed: true };
    }

    if (status === 'FAILED') {
      await this.prisma.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: failureReason || 'Declined at terminal', completedAt: new Date() },
      });
      return { received: true, success: false };
    }

    const order = await this.prisma.order.findUnique({ where: { id: transaction.orderId } });
    if (!order) {
      this.logger.error(`Moniepoint reconciliation failed: order ${transaction.orderId} not found for ${merchantReference}`);
      return { received: true, success: false, reason: 'Order not found' };
    }

    const amount = Number(transaction.amount);

    await this.prisma.$transaction(async (tx) => {
      const doubleCheck = await tx.moniepointTransaction.findUnique({ where: { id: transaction.id } });
      if (doubleCheck?.status !== 'PENDING') return;

      await tx.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'SUCCESS', completedAt: new Date() },
      });

      // Conditional update guards against a concurrent close (e.g. a cashier closing with cash
      // while this push was still in flight) racing past the PAYABLE_STATUSES check above.
      const result = await tx.order.updateMany({
        where: { id: order.id, status: { in: PAYABLE_STATUSES } },
        data: { amountPaid: amount, status: 'CLOSED_PAID', closedAt: new Date() },
      });

      await tx.payment.create({
        data: {
          organizationId: order.organizationId,
          orderId: order.id,
          amount,
          paymentMethod: 'MONIEPOINT_POS',
          paymentDate: new Date(),
          moniepointReference: merchantReference,
          isAutoRecorded: true,
          notes: result.count === 0 ? 'Received after order was already closed/cancelled — needs manual review' : undefined,
        },
      });

      if (result.count === 0) {
        this.logger.warn(`Order ${order.id} was already closed/cancelled by the time Moniepoint ref ${merchantReference} confirmed — payment recorded but order left unchanged.`);
        return;
      }

      await this.inventoryService.deductForOrder(tx, order.id, order.organizationId);

      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
      }
    });

    this.logger.log(`Moniepoint POS payment recorded for order ${order.id} (ref ${merchantReference})`);
    return { received: true, success: true };
  }
}
