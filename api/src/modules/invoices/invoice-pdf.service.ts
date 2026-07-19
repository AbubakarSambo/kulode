import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRenderService } from './invoice-render.service';
import { buildInvoiceHtml, RenderableInvoice, RenderablePaymentScheduleRow } from './invoice-template';

interface Installment {
  id: string;
  label: string;
  sequence: number;
  percentage: number;
  amount: number;
  isPaid: boolean;
  paymentUrl?: string | null;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  subtotal: number;
  discountType?: string;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes?: string | null;
  terms?: string | null;
  paymentUrl?: string | null;
  organization: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    logo?: string | null;
    planTier?: string | null;
    subscriptionStatus?: string | null;
    showQrCode?: boolean | null;
    rcNumber?: string | null;
    tin?: string | null;
    directors?: Array<{
      forenames: string;
      surname: string;
      formerName?: string | null;
      isNonNigerian: boolean;
      nationality?: string | null;
    }>;
  };
  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  installments?: Installment[];
}

const STATUS_TEXTS: Record<string, string> = {
  DRAFT: 'NOT YET ISSUED',
  SENT: 'AWAITING PAYMENT',
  PAID: 'PAID IN FULL',
  PARTIALLY_PAID: 'PART PAID',
  OVERDUE: 'PAYMENT OVERDUE',
  CANCELLED: 'CANCELLED',
};

const COLORS = {
  primary: '#0037b0',
  text: '#121c28',
  muted: '#434655',
  success: '#006c49',
  error: '#ba1a1a',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: COLORS.muted,
  SENT: COLORS.primary,
  PAID: COLORS.success,
  PARTIALLY_PAID: COLORS.primary,
  OVERDUE: COLORS.error,
  CANCELLED: COLORS.muted,
};

@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly renderService: InvoiceRenderService,
  ) {}

  async generatePdf(invoice: InvoiceData): Promise<Buffer> {
    const html = await this.buildHtml(invoice);
    return this.renderService.renderPdf(html);
  }

  async generatePng(invoice: InvoiceData): Promise<Buffer> {
    const html = await this.buildHtml(invoice);
    return this.renderService.renderPng(html);
  }

  private async buildHtml(invoice: InvoiceData): Promise<string> {
    // Paying PRO/BUSINESS orgs don't show "Powered by Tari1" footer text; FREE/trialing do.
    // However, the Tari1 Logo is drawn at the center of the footer for branding consistency.
    const isPayingPro = (invoice.organization.planTier === 'PRO' || invoice.organization.planTier === 'BUSINESS')
      && invoice.organization.subscriptionStatus !== 'TRIALING';

    let logoDataUri: string | null = null;
    if (invoice.organization.logo) {
      try {
        const buffer = await this.fetchImageBuffer(invoice.organization.logo);
        logoDataUri = this.toDataUri(buffer);
      } catch {
        // Skip if organization logo can't be loaded
      }
    }

    // Determine target URL for the QR code
    const qrTargetUrl = invoice.paymentUrl || (invoice.installments && invoice.installments.find(i => !i.isPaid)?.paymentUrl);
    let qrDataUri: string | null = null;
    if (invoice.organization.showQrCode && qrTargetUrl) {
      try {
        const shortenedQrUrl = await this.tryShortenUrl(qrTargetUrl);
        const qrBuffer = await QRCode.toBuffer(shortenedQrUrl, { width: 160, margin: 1 });
        qrDataUri = this.toDataUri(qrBuffer, 'image/png');
      } catch {
        // Skip if QR generation fails
      }
    }

    let tari1LogoDataUri: string | null = null;
    try {
      const logoPath = path.resolve(process.cwd(), '../client/public/logo.png');
      if (fs.existsSync(logoPath)) {
        tari1LogoDataUri = this.toDataUri(fs.readFileSync(logoPath), 'image/png');
      }
    } catch {
      // Skip if local logo can't be read
    }

    const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
    const allInstallments = (invoice.installments || []).slice().sort((a, b) => a.sequence - b.sequence);

    let paymentSchedule: RenderablePaymentScheduleRow[] | undefined;
    let singlePayment: { linkUrl: string; linkLabel: string } | null = null;

    if (allInstallments.length > 0 && balanceDue > 0) {
      paymentSchedule = [];
      for (const inst of allInstallments) {
        if (inst.isPaid) {
          paymentSchedule.push({
            label: inst.label,
            percentage: inst.percentage,
            amountLabel: this.formatCurrency(inst.amount),
            state: 'paid',
          });
        } else if (inst.paymentUrl) {
          const shortenedUrl = await this.tryShortenUrl(inst.paymentUrl);
          paymentSchedule.push({
            label: inst.label,
            percentage: inst.percentage,
            amountLabel: this.formatCurrency(inst.amount),
            state: 'link',
            linkUrl: shortenedUrl,
            linkLabel: shortenedUrl.replace(/^https?:\/\//, ''),
          });
        } else {
          paymentSchedule.push({
            label: inst.label,
            percentage: inst.percentage,
            amountLabel: this.formatCurrency(inst.amount),
            state: 'pending',
          });
        }
      }
    } else if (invoice.paymentUrl && balanceDue > 0) {
      const shortenedUrl = await this.tryShortenUrl(invoice.paymentUrl);
      singlePayment = { linkUrl: shortenedUrl, linkLabel: shortenedUrl.replace(/^https?:\/\//, '') };
    }

    const discountAmt = Number(invoice.discountAmount || 0);
    const discountPct = Number(invoice.discountPercent || 0);

    // Directors line (CAC/CAMA 2020 s.304 compliance) — full-width, above the footer divider
    const directorsLine = invoice.organization.directors && invoice.organization.directors.length > 0
      ? invoice.organization.directors
        .map((d) => {
          let s = `${d.forenames} ${d.surname}`;
          if (d.formerName) s += ` (formerly ${d.formerName})`;
          if (d.isNonNigerian && d.nationality) s += ` [${d.nationality}]`;
          return s;
        })
        .join(', ')
      : null;

    const renderable: RenderableInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      issueDateLabel: this.formatDate(invoice.issueDate),
      dueDateLabel: this.formatDate(invoice.dueDate),
      statusLabel: STATUS_TEXTS[invoice.status] || invoice.status.replace('_', ' ').toUpperCase(),
      statusColor: STATUS_COLORS[invoice.status] || COLORS.muted,
      organization: {
        name: invoice.organization.name,
        email: invoice.organization.email,
        phone: invoice.organization.phone,
        address: invoice.organization.address,
        rcNumber: invoice.organization.rcNumber,
        tin: invoice.organization.tin,
        logoDataUri,
      },
      client: {
        name: invoice.client.name,
        email: invoice.client.email,
        phone: invoice.client.phone,
        address: invoice.client.address,
      },
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceLabel: this.formatCurrency(item.unitPrice),
        amountLabel: this.formatCurrency(item.amount),
      })),
      subtotalLabel: this.formatCurrency(invoice.subtotal),
      discount: discountAmt > 0
        ? {
          label: invoice.discountType === 'FIXED' ? 'Discount' : `Discount (${discountPct}%)`,
          amountLabel: this.formatCurrency(discountAmt),
        }
        : null,
      tax: Number(invoice.taxAmount) > 0
        ? { label: `VAT (${invoice.taxRate ?? 7.5}%)`, amountLabel: this.formatCurrency(invoice.taxAmount) }
        : null,
      totalLabel: this.formatCurrency(invoice.total),
      amountPaidLabel: Number(invoice.amountPaid) > 0 ? this.formatCurrency(invoice.amountPaid) : null,
      balanceDueLabel: Number(invoice.amountPaid) > 0 ? this.formatCurrency(balanceDue) : null,
      paymentSchedule,
      singlePayment,
      notes: invoice.notes,
      terms: invoice.terms,
      directorsLine,
      qrDataUri,
      tari1LogoDataUri,
      showBuiltWith: !isPayingPro,
    };

    return buildInvoiceHtml(renderable);
  }

  private async tryShortenUrl(targetUrl: string): Promise<string> {
    if (!targetUrl) return '';
    try {
      // Check if short link already exists for this URL
      let shortLink = await this.prisma.shortLink.findFirst({
        where: { targetUrl },
      });

      if (!shortLink) {
        // Generate a unique slug
        let slug = '';
        let isUnique = false;
        while (!isUnique) {
          slug = Math.random().toString(36).substring(2, 7); // 5-character alphanumeric slug
          const existing = await this.prisma.shortLink.findUnique({
            where: { slug },
          });
          if (!existing) {
            isUnique = true;
          }
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        shortLink = await this.prisma.shortLink.create({
          data: {
            slug,
            targetUrl,
            expiresAt,
          },
        });
      }

      // Read frontendUrl from configService
      const frontendUrl = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
      // Clean trailing slash if present
      const baseUrl = frontendUrl.replace(/\/$/, '');
      return `${baseUrl}/p/${shortLink.slug}`;
    } catch (err) {
      console.error('Error generating short link in PDF service, falling back to original:', err);
      return targetUrl;
    }
  }

  private fetchImageBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private toDataUri(buffer: Buffer, knownMimeType?: string): string {
    const mimeType = knownMimeType || this.sniffImageMimeType(buffer);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private sniffImageMimeType(buffer: Buffer): string {
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')) {
      return 'image/gif';
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
    return 'image/png';
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formatted = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `NGN ${formatted}`;
  }
}
