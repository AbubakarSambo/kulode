import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface EmailOptions {
  accentColor?: string;       // Default: '#0037b0' (primary blue)
  contextLabel?: string;      // E.g. 'ONBOARDING' or 'BILLING'
  headline: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;
  private brandWebsiteUrl: string;
  private isMock = false;

  constructor(private configService: ConfigService) {
    let apiKey = this.configService.get<string>('resend.apiKey');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not set. Email service will run in MOCK mode (logging to console).');
      this.isMock = true;
      apiKey = 're_mock_key';
    }
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('resend.fromEmail') || 'Tari1 <noreply@tarione.com>';

    // Sanitize Frontend URL (remove trailing slashes, enforce protocol)
    let frontend = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
    frontend = frontend.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(frontend)) {
      frontend = `https://${frontend}`;
    }
    this.frontendUrl = frontend;

    // Sanitize Brand Website URL (remove trailing slashes, enforce protocol)
    let brand = this.configService.get<string>('resend.brandWebsiteUrl') || 'https://www.tarione.com';
    brand = brand.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(brand)) {
      brand = `https://${brand}`;
    }
    this.brandWebsiteUrl = brand;
  }

  private buildEmailHtml(options: EmailOptions): string {
    const accentColor = options.accentColor || '#0037b0';
    
    // Bulletproof Table-Button Layout
    const ctaSection = options.ctaText && options.ctaUrl
      ? `
        <div style="margin: 32px 0; text-align: left;">
          <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
            <tr>
              <td align="center" valign="middle" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; mso-line-height-rule: exactly; border-radius: 12px; background-color: ${accentColor};" bgcolor="${accentColor}">
                <a href="${options.ctaUrl}" target="_blank" class="btn" style="border: 12px solid ${accentColor}; border-left: 24px solid ${accentColor}; border-right: 24px solid ${accentColor}; display: inline-block; color: #ffffff !important; background-color: ${accentColor}; text-decoration: none; font-weight: 600; border-radius: 12px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 100%;">
                  ${options.ctaText}
                </a>
              </td>
            </tr>
          </table>
        </div>
      `
      : '';

    const footerNoteSection = options.footerNote
      ? `<p style="margin-top: 16px; margin-bottom: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; color: #64748b; font-style: italic;">${options.footerNote}</p>`
      : '';

    const contextLabelSection = options.contextLabel
      ? `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; color: ${accentColor}; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px;">${options.contextLabel}</div>`
      : '';

    const currentYear = new Date().getFullYear();

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${options.headline}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f8f9ff; }

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .btn { color: #ffffff !important; text-decoration: none !important; }
    .receipt-label { color: #64748b; }
    .receipt-value { color: #121c28; font-weight: 700; }

    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 16px !important; }
      .email-card { padding: 24px !important; border-radius: 16px !important; }
      .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; border-left: 0px !important; border-right: 0px !important; }
    }

    @media (prefers-color-scheme: dark) {
      body { background-color: #0b131f !important; }
      .email-card { background-color: #121c28 !important; border-color: #1e293b !important; }
      .text-title { color: #ffffff !important; }
      .text-body { color: #94a3b8 !important; }
      .logo-light { display: none !important; }
      .logo-dark { display: block !important; }
      .logo-fallback { color: #ffffff !important; }
      .receipt-box { background-color: #1e293b !important; border-color: #334155 !important; }
      .footer-text { color: #64748b !important; }
      .btn { color: #ffffff !important; }
      .receipt-label { color: #94a3b8 !important; }
      .receipt-value { color: #ffffff !important; }
    }

    [data-ogsc] body { background-color: #0b131f !important; }
    [data-ogsc] .email-card { background-color: #121c28 !important; border-color: #1e293b !important; }
    [data-ogsc] .text-title { color: #ffffff !important; }
    [data-ogsc] .text-body { color: #94a3b8 !important; }
    [data-ogsc] .logo-light { display: none !important; }
    [data-ogsc] .logo-dark { display: block !important; }
    [data-ogsc] .logo-fallback { color: #ffffff !important; }
    [data-ogsc] .receipt-box { background-color: #1e293b !important; border-color: #334155 !important; }
    [data-ogsc] .footer-text { color: #64748b !important; }
    [data-ogsc] .btn { color: #ffffff !important; }
    [data-ogsc] .receipt-label { color: #94a3b8 !important; }
    [data-ogsc] .receipt-value { color: #ffffff !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9ff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table border="0; " cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9ff;">
    <tr>
      <td align="center" style="padding: 40px 20px;" class="email-container">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border: 1px solid #eef4ff; border-radius: 20px; box-shadow: 0px 12px 32px rgba(0, 55, 176, 0.04); overflow: hidden;" class="email-card">
          <tr>
            <td height="6" style="background-color: ${accentColor}; font-size: 0px; line-height: 0px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 40px;" class="email-card-content">
              <div style="margin-bottom: 32px; text-align: left;">
                <img class="logo-light" src="${this.frontendUrl}/logo.png" alt="Tari1" width="120" height="40" style="display: block; max-width: 120px; height: auto; border: 0; outline: none; text-decoration: none;" id="logo-light" onerror="this.style.display='none'; document.getElementById('logo-fallback').style.display='inline-block';" />
                <!--[if !mso]><!-->
                <img class="logo-dark" src="${this.frontendUrl}/logo-white.png" alt="Tari1" width="120" height="40" style="display: none; max-width: 120px; height: auto; border: 0; outline: none; text-decoration: none;" id="logo-dark" onerror="this.style.display='none'; document.getElementById('logo-fallback').style.display='inline-block';" />
                <!--<![endif]-->
                <span id="logo-fallback" class="logo-fallback" style="display: none; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 22px; font-weight: 700; color: #0037b0; letter-spacing: -0.02em;">Tari1</span>
              </div>

              ${contextLabelSection}

              <h1 class="text-title" style="margin-top: 0; margin-bottom: 16px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; line-height: 1.3; color: #121c28; letter-spacing: -0.02em;">
                ${options.headline}
              </h1>

              <div class="text-body" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #434655; margin-bottom: 0;">
                ${options.bodyHtml}
              </div>

              ${ctaSection}
              ${footerNoteSection}
            </td>
          </tr>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin-top: 24px; text-align: center;">
          <tr>
            <td class="footer-text" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #94a3b8; padding: 0 20px;">
              <p style="margin: 0 0 4px 0;">&copy; ${currentYear} Tari1 &middot; ${this.brandWebsiteUrl.replace(/^https?:\/\/(www\.)?/, '')}</p>
              <p style="margin: 0; font-size: 11px;">You are receiving this transactional email because of your active Tari1 account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private async sendEmail(options: { to: string; subject: string; html: string }): Promise<void> {
    if (this.isMock) {
      this.logger.log(`[MOCK EMAIL] Sending to: ${options.to}`);
      this.logger.log(`[MOCK EMAIL] Subject: ${options.subject}`);
      
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

    const html = this.buildEmailHtml({
      contextLabel: 'Security',
      headline: 'Verify your email address',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>Welcome to Tari1! We are excited to help you streamline your invoicing, collections, and financial operations.</p>
        <p>Please click the button below to verify your email address and activate your account:</p>
      `,
      ctaText: 'Verify Email',
      ctaUrl: verifyUrl,
      footerNote: "This verification link is valid for 24 hours. If you didn't create a Tari1 account, you can safely ignore this email.",
    });

    await this.sendEmail({
      to: email,
      subject: 'Verify your email - Tari1',
      html,
    });
  }

  async sendPasswordSetupEmail(email: string, firstName: string, token: string, orgName: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/set-password?token=${token}`;

    const html = this.buildEmailHtml({
      contextLabel: 'Team Invitation',
      headline: `Join ${orgName} on Tari1`,
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>You have been invited to join <strong>${orgName}</strong> on Tari1.</p>
        <p>Click the button below to set up your password, activate your account, and join your team:</p>
      `,
      ctaText: 'Set Password & Join',
      ctaUrl: setupUrl,
      footerNote: 'This invitation link is valid for 72 hours. If you did not expect this invitation, you can safely ignore this email.',
    });

    await this.sendEmail({
      to: email,
      subject: `You've been invited to ${orgName} - Tari1`,
      html,
    });
  }

  async sendMagicLinkEmail(email: string, firstName: string, token: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    const html = this.buildEmailHtml({
      contextLabel: 'Security',
      headline: 'Activate your Tari1 account',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>Click the button below to sign in and activate your Tari1 account instantly. No password is required at this stage.</p>
      `,
      ctaText: 'Activate Account',
      ctaUrl: verifyUrl,
      footerNote: 'This activation link is valid for 24 hours. If you did not sign up for Tari1, you can safely ignore this email.',
    });

    await this.sendEmail({
      to: email,
      subject: 'Activate your Tari1 account',
      html,
    });
  }

  async sendAddPasswordEmail(email: string, firstName: string, token: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/set-password?token=${token}`;

    const html = this.buildEmailHtml({
      contextLabel: 'Security',
      headline: 'Add a password to your account',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>You currently sign in using Google OAuth. If you would also like to sign in using email and a password, click the button below to set one:</p>
      `,
      ctaText: 'Set Password',
      ctaUrl: setupUrl,
      footerNote: 'This link is valid for 72 hours. If you did not request this, you can safely ignore this email.',
    });

    await this.sendEmail({
      to: email,
      subject: 'Add a password to your Tari1 account',
      html,
    });
  }

  async sendClientReminderEmail(email: string, firstName: string): Promise<void> {
    const clientsUrl = `${this.frontendUrl}/clients`;

    const html = this.buildEmailHtml({
      contextLabel: 'Getting Started',
      headline: 'Add your first client to start invoicing',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>You have successfully set up your Tari1 account — a great first step! The only thing left before you can send your first invoice is adding a client record.</p>
        <p>It takes less than a minute. Click the button below to add your first client:</p>
      `,
      ctaText: 'Add First Client',
      ctaUrl: clientsUrl,
      footerNote: 'Once added, you can generate and send professional payment requests instantly.',
    });

    await this.sendEmail({
      to: email,
      subject: "You're one step away from sending your first invoice",
      html,
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
    const html = this.buildEmailHtml({
      accentColor: '#e07b00',
      contextLabel: 'Payment Reminder',
      headline: `Payment Reminder: Invoice ${invoiceNumber}`,
      bodyHtml: `
        <p>Hi ${clientName},</p>
        <p>This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> from <strong>${orgName}</strong> is due for payment.</p>
        <div class="receipt-box" style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.6;">
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Invoice Number</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Total Amount</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${total}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Amount Due</td>
              <td align="right" class="receipt-value" style="color: #ba1a1a !important; padding-bottom: 8px;">${outstanding}</td>
            </tr>
            <tr>
              <td class="receipt-label">Due Date</td>
              <td align="right" class="receipt-value">${dueDate}</td>
            </tr>
          </table>
        </div>
        <p>Please review the details and make the payment by the due date. Thank you for your prompt attention.</p>
      `,
      ctaText: paymentUrl ? 'Pay Invoice' : undefined,
      ctaUrl: paymentUrl || undefined,
      footerNote: paymentUrl ? 'If you have already made this payment, please disregard this email.' : undefined,
    });

    await this.sendEmail({
      to: email,
      subject: `Payment reminder: Invoice ${invoiceNumber} from ${orgName}`,
      html,
    });
  }

  async sendRenewalFailedEmail(email: string, firstName: string, planTier: string): Promise<void> {
    const loginUrl = `${this.frontendUrl}/settings/billing`;

    const html = this.buildEmailHtml({
      accentColor: '#ba1a1a',
      contextLabel: 'Billing Action Required',
      headline: 'Subscription Renewal Failed',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>We were unable to automatically renew your <strong>Tari1 ${planTier}</strong> subscription. This may be due to an expired card, insufficient funds, or a change in your billing details.</p>
        <p>To avoid losing access to your invoicing tools and account features, please update your payment method and renew your subscription:</p>
      `,
      ctaText: 'Update Payment & Renew',
      ctaUrl: loginUrl,
      footerNote: 'Your data is completely safe, but invoicing capabilities will be temporarily locked until the renewal is successful.',
    });

    await this.sendEmail({
      to: email,
      subject: 'Your Tari1 subscription could not be renewed',
      html,
    });
  }

  async sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = this.buildEmailHtml({
      contextLabel: 'Security',
      headline: 'Reset your password',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>We received a request to reset the password for your Tari1 account. Click the button below to choose a new one:</p>
      `,
      ctaText: 'Reset Password',
      ctaUrl: resetUrl,
      footerNote: 'This password reset link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.',
    });

    await this.sendEmail({
      to: email,
      subject: 'Reset your password - Tari1',
      html,
    });
  }

  async sendTrialEndingWarningEmail(email: string, firstName: string, daysRemaining: number): Promise<void> {
    const billingUrl = `${this.frontendUrl}/settings/billing`;

    const html = this.buildEmailHtml({
      accentColor: '#e07b00',
      contextLabel: 'Trial Warning',
      headline: `Your free trial ends in ${daysRemaining} days`,
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>This is a quick friendly reminder that your 30-day free trial of <strong>Tari1</strong> is ending in <strong>${daysRemaining} days</strong>.</p>
        <p>To ensure uninterrupted access to your invoicing, reports, client lists, and expense tracking tools, please select a plan and add a payment method before your trial expires.</p>
      `,
      ctaText: 'Select a Pricing Plan',
      ctaUrl: billingUrl,
      footerNote: 'If you choose not to subscribe, your account will be temporarily locked on day 31, but your data will remain completely safe.',
    });

    await this.sendEmail({
      to: email,
      subject: `Your Tari1 free trial ends in ${daysRemaining} days`,
      html,
    });
  }

  async sendTrialExpiredEmail(email: string, firstName: string): Promise<void> {
    const billingUrl = `${this.frontendUrl}/settings/billing`;

    const html = this.buildEmailHtml({
      accentColor: '#ba1a1a',
      contextLabel: 'Trial Expired',
      headline: 'Your free trial has ended',
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>Your 30-day trial of <strong>Tari1</strong> has officially expired, and your account invoicing features have been temporarily locked.</p>
        <p>Your invoice data, clients, and expenses are completely safe, but you will need to subscribe to a paid plan to resume creating and managing invoices.</p>
      `,
      ctaText: 'Choose Plan & Upgrade',
      ctaUrl: billingUrl,
      footerNote: 'Select the Starter plan at just ₦4,500/month to get started instantly.',
    });

    await this.sendEmail({
      to: email,
      subject: 'Your Tari1 free trial has ended',
      html,
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

    const html = this.buildEmailHtml({
      accentColor: '#006c49',
      contextLabel: 'Subscription Activated',
      headline: `Welcome to Tari1 ${planTier}!`,
      bodyHtml: `
        <p>Hi ${firstName},</p>
        <p>Thank you! Your subscription to the <strong>Tari1 ${planTier}</strong> plan is now active.</p>
        <div class="receipt-box" style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 14px;" class="receipt-value">Receipt Summary</h4>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.6;">
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Plan:</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${planTier} (${billingPeriod.toLowerCase()})</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Amount Paid:</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${formattedAmount}</td>
            </tr>
            <tr>
              <td class="receipt-label">Next Billing Date:</td>
              <td align="right" class="receipt-value">${nextBillingDate}</td>
            </tr>
          </table>
        </div>
        <p>If you enabled automatic renewals, your card will be charged automatically on each renewal date. You can manage your preferences or subscription status in your billing settings anytime.</p>
      `,
      ctaText: 'Go to Billing Settings',
      ctaUrl: billingUrl,
    });

    await this.sendEmail({
      to: email,
      subject: 'Subscription Activated - Tari1',
      html,
    });
  }

  // --- NEW INVOICING & PAYMENT NOTIFICATION METHODS ---

  async sendInvoiceEmail(
    email: string,
    clientName: string,
    invoiceNumber: string,
    orgName: string,
    total: string,
    dueDate: string,
    paymentUrl: string | null,
    viewUrl?: string | null,
  ): Promise<void> {
    const ctaUrl = paymentUrl || viewUrl || undefined;
    const ctaText = paymentUrl ? 'Pay Invoice' : viewUrl ? 'View Invoice' : undefined;
    const footerNote = paymentUrl
      ? 'You can complete your payment securely online via Paystack.'
      : viewUrl
        ? 'View the invoice and available payment options online.'
        : undefined;

    const html = this.buildEmailHtml({
      contextLabel: 'Invoice Delivery',
      headline: `New Invoice ${invoiceNumber} from ${orgName}`,
      bodyHtml: `
        <p>Hi ${clientName},</p>
        <p><strong>${orgName}</strong> has sent you a new invoice for <strong>${total}</strong>. Details of the invoice are summarized below:</p>
        <div class="receipt-box" style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.6;">
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Invoice Number</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Total Amount</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${total}</td>
            </tr>
            <tr>
              <td class="receipt-label">Due Date</td>
              <td align="right" class="receipt-value">${dueDate}</td>
            </tr>
          </table>
        </div>
        <p>Please review and pay by the due date. Thank you for your business!</p>
      `,
      ctaText,
      ctaUrl,
      footerNote,
    });

    await this.sendEmail({
      to: email,
      subject: `New Invoice ${invoiceNumber} from ${orgName}`,
      html,
    });
  }

  async sendPaymentReceiptEmail(
    email: string,
    clientName: string,
    invoiceNumber: string,
    orgName: string,
    amountPaid: string,
    outstanding: string,
    paymentDate: string,
    channel: string,
  ): Promise<void> {
    const html = this.buildEmailHtml({
      accentColor: '#006c49',
      contextLabel: 'Payment Receipt',
      headline: `Payment Confirmation: Invoice ${invoiceNumber}`,
      bodyHtml: `
        <p>Hi ${clientName},</p>
        <p>Thank you for your payment! We have successfully received payment for invoice <strong>${invoiceNumber}</strong>. Here are your transaction details:</p>
        <div class="receipt-box" style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.6;">
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Invoice Number</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Amount Paid</td>
              <td align="right" class="receipt-value" style="color: #006c49 !important; padding-bottom: 8px;">${amountPaid}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Balance Outstanding</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${outstanding}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Payment Date</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${paymentDate}</td>
            </tr>
            <tr>
              <td class="receipt-label">Payment Method</td>
              <td align="right" class="receipt-value">${channel}</td>
            </tr>
          </table>
        </div>
        <p>If you have any questions, please reply directly to the merchant (<strong>${orgName}</strong>).</p>
      `,
    });

    await this.sendEmail({
      to: email,
      subject: `Payment Confirmation: Invoice ${invoiceNumber} - ${orgName}`,
      html,
    });
  }

  async sendMerchantPaymentAlertEmail(
    email: string,
    merchantName: string,
    clientName: string,
    invoiceNumber: string,
    amountPaid: string,
    channel: string,
    settlementStatus: string,
    paymentDate: string,
  ): Promise<void> {
    const html = this.buildEmailHtml({
      accentColor: '#006c49',
      contextLabel: 'Merchant Notification',
      headline: `Payment Received: ${amountPaid}`,
      bodyHtml: `
        <p>Hi ${merchantName},</p>
        <p>Congratulations! <strong>${clientName}</strong> has paid <strong>${amountPaid}</strong> for invoice <strong>${invoiceNumber}</strong>.</p>
        <div class="receipt-box" style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h4 style="margin-top: 0; margin-bottom: 12px;" class="receipt-value">Transaction Details</h4>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.6;">
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Client</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${clientName}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Invoice</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Amount Paid</td>
              <td align="right" class="receipt-value" style="color: #006c49 !important; padding-bottom: 8px;">${amountPaid}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Payment Date</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${paymentDate}</td>
            </tr>
            <tr>
              <td class="receipt-label" style="padding-bottom: 8px;">Payment Channel</td>
              <td align="right" class="receipt-value" style="padding-bottom: 8px;">${channel}</td>
            </tr>
            <tr>
              <td class="receipt-label">Settlement Status</td>
              <td align="right" class="receipt-value">${settlementStatus}</td>
            </tr>
          </table>
        </div>
        <p>This payment has been automatically recorded in your Tari1 dashboard.</p>
      `,
      ctaText: 'View Invoices',
      ctaUrl: `${this.frontendUrl}/invoices`,
    });

    await this.sendEmail({
      to: email,
      subject: `Payment Alert: Invoice ${invoiceNumber} paid by ${clientName}`,
      html,
    });
  }
}
