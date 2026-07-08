import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface SendInvoiceReminderParams {
  organizationId: string;
  invoiceId: string;
  clientId: string;
  toPhone: string;
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  paymentUrl?: string | null;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly reminderTemplateName: string;
  private readonly templateLanguage: string;
  private readonly webhookVerifyToken: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.phoneNumberId = this.configService.get<string>('whatsapp.phoneNumberId') || '';
    this.accessToken = this.configService.get<string>('whatsapp.accessToken') || '';
    this.apiVersion = this.configService.get<string>('whatsapp.apiVersion') || 'v21.0';
    this.reminderTemplateName = this.configService.get<string>('whatsapp.reminderTemplateName') || 'payment_reminder';
    this.templateLanguage = this.configService.get<string>('whatsapp.templateLanguage') || 'en';
    this.webhookVerifyToken = this.configService.get<string>('whatsapp.webhookVerifyToken') || '';
  }

  private get isMockMode(): boolean {
    return !this.accessToken || !this.phoneNumberId || this.accessToken.includes('xxxx');
  }

  private async makeRequest<T>(endpoint: string, body: any): Promise<T> {
    const url = `https://graph.facebook.com/${this.apiVersion}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new BadRequestException(data?.error?.message || 'WhatsApp API error');
      }

      return data as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('WhatsApp API error', error);
      throw new InternalServerErrorException('Failed to communicate with WhatsApp API');
    }
  }

  // WhatsApp requires E.164 digits with no leading '+' or '0'. Numbers saved in
  // local Nigerian format (e.g. "08130000101") are converted to "234..." form.
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      return `234${digits.slice(1)}`;
    }
    return digits;
  }

  async sendInvoiceReminderTemplate(params: SendInvoiceReminderParams): Promise<{ providerMessageId: string | null }> {
    const toPhone = this.normalizePhone(params.toPhone);

    const payload = {
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: {
        name: this.reminderTemplateName,
        language: { code: this.templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.clientName },
              { type: 'text', text: params.invoiceNumber },
              { type: 'text', text: params.amountDue },
              { type: 'text', text: params.dueDate },
            ],
          },
        ],
      },
    };

    if (this.isMockMode) {
      this.logger.warn(
        `[MOCK WHATSAPP] Would send "${this.reminderTemplateName}" template to ${toPhone} for invoice ${params.invoiceNumber}`,
      );
      await this.prisma.whatsappMessage.create({
        data: {
          organizationId: params.organizationId,
          invoiceId: params.invoiceId,
          clientId: params.clientId,
          templateName: this.reminderTemplateName,
          toPhone,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
      return { providerMessageId: null };
    }

    try {
      const data = await this.makeRequest<{ messages?: { id: string }[] }>(
        `/${this.phoneNumberId}/messages`,
        payload,
      );
      const providerMessageId = data.messages?.[0]?.id || null;

      await this.prisma.whatsappMessage.create({
        data: {
          organizationId: params.organizationId,
          invoiceId: params.invoiceId,
          clientId: params.clientId,
          templateName: this.reminderTemplateName,
          toPhone,
          status: 'SENT',
          providerMessageId,
          sentAt: new Date(),
        },
      });

      return { providerMessageId };
    } catch (error) {
      await this.prisma.whatsappMessage.create({
        data: {
          organizationId: params.organizationId,
          invoiceId: params.invoiceId,
          clientId: params.clientId,
          templateName: this.reminderTemplateName,
          toPhone,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  isValidVerifyToken(token: string | undefined): boolean {
    return !!this.webhookVerifyToken && token === this.webhookVerifyToken;
  }

  async handleWebhookEvent(payload: any): Promise<void> {
    const entries = payload?.entry || [];

    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        if (!value) continue;

        for (const status of value.statuses || []) {
          await this.applyStatusUpdate(status);
        }

        for (const message of value.messages || []) {
          // Inbound replies aren't acted on yet - just recorded for visibility.
          this.logger.log(`[WHATSAPP INBOUND] from ${message.from}: ${JSON.stringify(message)}`);
        }
      }
    }
  }

  private async applyStatusUpdate(status: any): Promise<void> {
    const providerMessageId = status?.id;
    const mappedStatus = this.mapMetaStatus(status?.status);
    if (!providerMessageId || !mappedStatus) return;

    const error = status.errors?.[0];

    const result = await this.prisma.whatsappMessage.updateMany({
      where: { providerMessageId },
      data: {
        status: mappedStatus,
        ...(error
          ? { errorCode: String(error.code), errorMessage: error.title || error.message }
          : {}),
      },
    });

    if (result.count === 0) {
      this.logger.warn(`Received WhatsApp status update for unknown message ${providerMessageId}`);
    }
  }

  private mapMetaStatus(status: string): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null {
    switch (status) {
      case 'sent':
        return 'SENT';
      case 'delivered':
        return 'DELIVERED';
      case 'read':
        return 'READ';
      case 'failed':
        return 'FAILED';
      default:
        return null;
    }
  }
}
