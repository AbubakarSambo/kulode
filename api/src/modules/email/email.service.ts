import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;
  private isMock = false;

  constructor(private configService: ConfigService) {
    let apiKey = this.configService.get<string>('resend.apiKey');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Email service will run in MOCK mode (logging to console).');
      this.isMock = true;
      apiKey = 're_mock_key';
    }
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('resend.fromEmail') || 'Tari1 <noreply@tari1.app>';
    this.frontendUrl = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
  }

  private async sendEmail(options: { to: string; subject: string; html: string }): Promise<void> {
    if (this.isMock) {
      this.logger.log(`[MOCK EMAIL] Sending to: ${options.to}`);
      this.logger.log(`[MOCK EMAIL] Subject: ${options.subject}`);
      
      // Extract links to make testing easier
      const linkRegex = /href="([^"]+)"/g;
      let match;
      while ((match = linkRegex.exec(options.html)) !== null) {
        this.logger.log(`[MOCK EMAIL] Link found: ${match[1]}`);
      }
      return;
    }

    const { data, error } = await this.resend.emails.send({
      from: this.fromEmail,
      ...options,
    });

    if (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.name} - ${error.message}`);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    this.logger.log(`Email sent to ${options.to} (id: ${data?.id})`);
  }

  async sendVerificationEmail(email: string, firstName: string, token: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Verify your email - Tari1',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Tari1, ${firstName}!</h2>
          <p>Thanks for signing up. Please verify your email address by clicking the button below:</p>
          <div style="margin: 32px 0;">
            <a href="${verifyUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This link expires in 24 hours.</p>
          <p style="color: #64748b; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  async sendPasswordSetupEmail(email: string, firstName: string, token: string, orgName: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/set-password?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: `You've been invited to ${orgName} - Tari1`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>You've been invited to join <strong>${orgName}</strong> on Tari1.</p>
          <p>Click the button below to set your password and activate your account:</p>
          <div style="margin: 32px 0;">
            <a href="${setupUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Set Password & Join
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This link expires in 72 hours.</p>
          <p style="color: #64748b; font-size: 14px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  async sendMagicLinkEmail(email: string, firstName: string, token: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Activate your Tari1 account',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Tari1, ${firstName}!</h2>
          <p>Click the button below to activate your account — no password needed yet.</p>
          <div style="margin: 32px 0;">
            <a href="${verifyUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Activate my account
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This link expires in 24 hours.</p>
          <p style="color: #64748b; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  async sendAddPasswordEmail(email: string, firstName: string, token: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/set-password?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Add a password to your Tari1 account',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>You signed in with Google, but you can also add a password to your account.</p>
          <p>Click the button below to set one:</p>
          <div style="margin: 32px 0;">
            <a href="${setupUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Set Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This link expires in 72 hours.</p>
          <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  async sendClientReminderEmail(email: string, firstName: string): Promise<void> {
    const clientsUrl = `${this.frontendUrl}/clients`;

    await this.sendEmail({
      to: email,
      subject: "You're one step away from sending your first invoice",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>You've set up your Tari1 account — great start! The only thing left before you can send your first invoice is adding a client.</p>
          <p>It takes less than a minute:</p>
          <div style="margin: 32px 0;">
            <a href="${clientsUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Add your first client
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">Once you've added a client, you'll be ready to create and send invoices right away.</p>
        </div>
      `,
    });
  }

  async sendInvoiceReminderEmail(
    email: string,
    clientName: string,
    invoiceNumber: string,
    orgName: string,
    dueDate: string,
    total: string,
    outstanding: string,
    paymentUrl: string | null,
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Payment reminder: Invoice ${invoiceNumber} from ${orgName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Reminder</h2>
          <p>Hi ${clientName},</p>
          <p>This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> from <strong>${orgName}</strong> is due for payment.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Invoice Number</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Total Amount</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${total}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Amount Due</td>
              <td style="padding: 8px 0; font-weight: bold; color: #dc2626; text-align: right;">${outstanding}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Due Date</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${dueDate}</td>
            </tr>
          </table>
          ${paymentUrl ? `
          <div style="margin: 32px 0;">
            <a href="${paymentUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Pay Now
            </a>
          </div>
          ` : ''}
          <p style="color: #64748b; font-size: 14px;">If you have already made this payment, please disregard this message.</p>
          <p style="color: #64748b; font-size: 14px;">Thank you for your prompt attention.</p>
        </div>
      `,
    });
  }

  async sendRenewalFailedEmail(email: string, firstName: string, planTier: string): Promise<void> {
    const loginUrl = `${this.frontendUrl}/settings/billing`;

    await this.sendEmail({
      to: email,
      subject: 'Your Tari1 subscription could not be renewed',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>We were unable to automatically renew your <strong>Tari1 ${planTier}</strong> subscription. This may be due to an expired card, insufficient funds, or a change in your payment details.</p>
          <p>To avoid losing access to your account features, please update your payment method and renew your subscription:</p>
          <div style="margin: 32px 0;">
            <a href="${loginUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Update payment & renew
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">If you have any questions, reply to this email and we'll help you out.</p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Reset your password - Tari1',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>We received a request to reset your password. Click the button below to choose a new one:</p>
          <div style="margin: 32px 0;">
            <a href="${resetUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">This link expires in 1 hour.</p>
          <p style="color: #64748b; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  async sendTrialEndingWarningEmail(email: string, firstName: string, daysRemaining: number): Promise<void> {
    const billingUrl = `${this.frontendUrl}/settings/billing`;

    await this.sendEmail({
      to: email,
      subject: `Your TariOne free trial ends in ${daysRemaining} days`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #0f172a;">Your trial is ending soon</h2>
          <p>Hi ${firstName},</p>
          <p>This is a quick friendly reminder that your 30-day free trial of <strong>TariOne</strong> is ending in <strong>${daysRemaining} days</strong>.</p>
          <p>To ensure uninterrupted access to your invoicing, reports, client list, and expense tracking tools, please select a plan and add a payment method before your trial expires.</p>
          <div style="margin: 32px 0;">
            <a href="${billingUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Select a Pricing Plan
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">If you choose not to subscribe, your account features will be temporarily locked on day 31, but your data will remain completely safe.</p>
          <p style="color: #64748b; font-size: 14px;">If you have any questions, simply reply to this email.</p>
        </div>
      `,
    });
  }

  async sendTrialExpiredEmail(email: string, firstName: string): Promise<void> {
    const billingUrl = `${this.frontendUrl}/settings/billing`;

    await this.sendEmail({
      to: email,
      subject: 'Your TariOne free trial has ended',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #dc2626;">Your trial has expired</h2>
          <p>Hi ${firstName},</p>
          <p>Your 30-day trial of <strong>TariOne</strong> has officially expired, and your account features have been temporarily locked.</p>
          <p>Your invoice data, clients, and expenses are completely safe, but you'll need to subscribe to a paid plan to resume creating and managing invoices.</p>
          <div style="margin: 32px 0;">
            <a href="${billingUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Choose Plan & Upgrade
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">Select the entry-level Starter plan at just ₦4,500/month to get started instantly.</p>
          <p style="color: #64748b; font-size: 14px;">Thank you for testing TariOne!</p>
        </div>
      `,
    });
  }

  async sendSubscriptionSuccessEmail(
    email: string,
    firstName: string,
    planTier: string,
    billingPeriod: string,
    amount: number,
    nextBillingDate: string,
  ): Promise<void> {
    const billingUrl = `${this.frontendUrl}/settings/billing`;
    const formattedAmount = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);

    await this.sendEmail({
      to: email,
      subject: 'Subscription Activated - TariOne',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #16a34a;">Welcome to TariOne!</h2>
          <p>Hi ${firstName},</p>
          <p>Thank you! Your subscription to the <strong>TariOne ${planTier}</strong> plan is now active.</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 24px 0; border: 1px solid #e2e8f0;">
            <h4 style="margin: 0 0 12px 0; color: #0f172a;">Receipt Summary</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Plan:</td>
                <td style="padding: 4px 0; font-weight: 600; text-align: right; color: #0f172a;">${planTier} (${billingPeriod.toLowerCase()})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Amount Paid:</td>
                <td style="padding: 4px 0; font-weight: 600; text-align: right; color: #0f172a;">${formattedAmount}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Next Billing Date:</td>
                <td style="padding: 4px 0; font-weight: 600; text-align: right; color: #0f172a;">${nextBillingDate}</td>
              </tr>
            </table>
          </div>
          <p>If you enabled automatic renewals, your card will be charged on each renewal date automatically. You can toggle auto-renewal optionally anytime in your billing settings.</p>
          <div style="margin: 32px 0;">
            <a href="${billingUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              Go to Billing Settings
            </a>
          </div>
          <p style="color: #64748b; font-size: 14px;">We're excited to have you on board! If you have any feedback or questions, please reach out to us.</p>
        </div>
      `,
    });
  }
}
