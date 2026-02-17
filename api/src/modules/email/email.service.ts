import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('resend.fromEmail') || 'Kulode <noreply@kulode.com>';
    this.frontendUrl = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
  }

  async sendVerificationEmail(email: string, firstName: string, token: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Verify your email - Kulode',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Kulode, ${firstName}!</h2>
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
    this.logger.log(`Verification email sent to ${email}`);
  }

  async sendPasswordSetupEmail(email: string, firstName: string, token: string, orgName: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/set-password?token=${token}`;

    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: `You've been invited to ${orgName} - Kulode`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${firstName},</h2>
          <p>You've been invited to join <strong>${orgName}</strong> on Kulode.</p>
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
    this.logger.log(`Password setup email sent to ${email}`);
  }
}
