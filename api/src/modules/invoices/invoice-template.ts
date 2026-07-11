// Pure HTML template for invoice rendering. Takes only pre-formatted, pre-resolved
// data (currency strings, shortened URLs, base64 image data URIs) — no I/O, no async.
// Rendered by InvoiceRenderService (puppeteer) into either a PDF or a PNG.

export interface RenderablePaymentScheduleRow {
  label: string;
  percentage: number;
  amountLabel: string;
  state: 'paid' | 'link' | 'pending';
  linkUrl?: string;
  linkLabel?: string;
}

export interface RenderableInvoice {
  invoiceNumber: string;
  issueDateLabel: string;
  dueDateLabel: string;
  statusLabel: string;
  statusColor: string;
  organization: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    rcNumber?: string | null;
    logoDataUri?: string | null;
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
    unitPriceLabel: string;
    amountLabel: string;
  }>;
  subtotalLabel: string;
  discount?: { label: string; amountLabel: string } | null;
  tax?: { label: string; amountLabel: string } | null;
  totalLabel: string;
  amountPaidLabel?: string | null;
  balanceDueLabel?: string | null;
  paymentSchedule?: RenderablePaymentScheduleRow[];
  singlePayment?: { linkUrl: string; linkLabel: string } | null;
  notes?: string | null;
  terms?: string | null;
  directorsLine?: string | null;
  qrDataUri?: string | null;
  tari1LogoDataUri?: string | null;
  showBuiltWith: boolean;
}

const COLORS = {
  primary: '#0037b0',
  text: '#121c28',
  muted: '#434655',
  success: '#006c49',
  surface: '#f8f9ff',
  rowAlt: '#f8fafc',
  divider: '#e2e8f0',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function renderContactBlock(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => !!line)
    .map((line) => `<div class="contact-line">${escapeHtml(line)}</div>`)
    .join('');
}

function renderPaymentSection(invoice: RenderableInvoice): string {
  if (invoice.paymentSchedule && invoice.paymentSchedule.length > 0) {
    const rows = invoice.paymentSchedule
      .map((row) => {
        let statusCell: string;
        if (row.state === 'paid') {
          statusCell = `<span class="schedule-paid">PAID</span>`;
        } else if (row.state === 'link' && row.linkUrl && row.linkLabel) {
          statusCell = `Pay Link: <a class="schedule-link" href="${escapeHtml(row.linkUrl)}">${escapeHtml(row.linkLabel)}</a>`;
        } else {
          statusCell = `<span class="schedule-pending">Link pending</span>`;
        }
        return `
          <div class="schedule-row">
            <div class="schedule-label">${escapeHtml(row.label)} (${row.percentage}%)</div>
            <div class="schedule-amount">${escapeHtml(row.amountLabel)}</div>
            <div class="schedule-status">${statusCell}</div>
          </div>`;
      })
      .join('');
    return `
      <div class="payment-section">
        <div class="section-heading">PAYMENT SCHEDULE</div>
        ${rows}
      </div>`;
  }

  if (invoice.singlePayment) {
    return `
      <div class="payment-callout">
        <div class="payment-callout-label">SECURE ONLINE PAYMENT</div>
        <div class="payment-callout-link">Link: <a href="${escapeHtml(invoice.singlePayment.linkUrl)}">${escapeHtml(invoice.singlePayment.linkLabel)}</a></div>
      </div>`;
  }

  return '';
}

function renderNotesAndTerms(invoice: RenderableInvoice): string {
  if (!invoice.notes && !invoice.terms) return '';
  return `
    <div class="notes-terms">
      ${invoice.notes ? `<div class="notes-terms-col"><div class="section-heading">NOTES</div><div class="notes-terms-body">${nl2br(invoice.notes)}</div></div>` : '<div class="notes-terms-col"></div>'}
      ${invoice.terms ? `<div class="notes-terms-col"><div class="section-heading">TERMS &amp; CONDITIONS</div><div class="notes-terms-body">${nl2br(invoice.terms)}</div></div>` : '<div class="notes-terms-col"></div>'}
    </div>`;
}

export function buildInvoiceHtml(invoice: RenderableInvoice): string {
  const itemRows = invoice.items
    .map(
      (item, index) => `
        <tr class="${index % 2 === 1 ? 'row-alt' : ''}">
          <td class="col-description">${escapeHtml(item.description)}</td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-unit-price">${escapeHtml(item.unitPriceLabel)}</td>
          <td class="col-amount">${escapeHtml(item.amountLabel)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: ${COLORS.text};
    background: #ffffff;
  }
  .page {
    width: 595pt;
    padding: 50pt;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .org-block { max-width: 260pt; }
  .org-logo { max-width: 120pt; max-height: 40pt; display: block; margin-bottom: 8pt; }
  .org-name { font-size: 13pt; font-weight: bold; margin-bottom: 6pt; }
  .org-block .contact-line { font-size: 9pt; color: ${COLORS.muted}; line-height: 1.4; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 22pt; font-weight: bold; }
  .invoice-number { font-size: 11pt; color: ${COLORS.muted}; margin-top: 6pt; }
  .invoice-status { font-size: 9pt; font-weight: bold; margin-top: 8pt; text-transform: uppercase; }

  .divider { border-top: 0.75pt solid ${COLORS.divider}; margin: 20pt 0; }

  .bill-row { display: flex; justify-content: space-between; }
  .bill-to-block { max-width: 260pt; }
  .section-heading { font-size: 9pt; font-weight: bold; color: ${COLORS.muted}; margin-bottom: 8pt; letter-spacing: 0.02em; }
  .client-name { font-size: 11pt; font-weight: bold; margin-bottom: 8pt; }
  .bill-to-block .contact-line { font-size: 9pt; color: ${COLORS.muted}; line-height: 1.4; }
  .dates-block { display: flex; gap: 40pt; }
  .date-col .section-heading { margin-bottom: 6pt; }
  .date-col .date-value { font-size: 9pt; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 32pt; }
  table.items thead td { background: ${COLORS.surface}; font-size: 9pt; font-weight: bold; padding: 6pt 8pt; }
  table.items tbody td { font-size: 9pt; padding: 6pt 8pt; }
  table.items tr.row-alt td { background: ${COLORS.rowAlt}; }
  .col-description { width: 41%; text-align: left; }
  .col-qty { width: 7%; text-align: right; }
  .col-unit-price { width: 25%; text-align: right; }
  .col-amount { width: 27%; text-align: right; }

  .totals { display: flex; justify-content: flex-end; margin-top: 15pt; }
  .totals-table { width: 245pt; }
  .totals-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 4pt 0; color: ${COLORS.muted}; }
  .totals-row .value { color: ${COLORS.text}; }
  .totals-row.positive { color: ${COLORS.success}; }
  .totals-row.positive .value { color: ${COLORS.success}; }
  .totals-divider { border-top: 0.5pt solid ${COLORS.divider}; margin: 4pt 0; }
  .totals-row.total { font-size: 10pt; font-weight: bold; color: ${COLORS.text}; padding-top: 8pt; }
  .totals-row.total .value { color: ${COLORS.text}; }
  .totals-row.balance { font-weight: bold; }

  .payment-section { margin-top: 30pt; }
  .schedule-row { display: flex; align-items: center; font-size: 8.5pt; background: ${COLORS.surface}; padding: 6pt 8pt; margin-bottom: 2pt; }
  .schedule-label { width: 30%; font-weight: bold; }
  .schedule-amount { width: 20%; text-align: right; padding-right: 16pt; }
  .schedule-status { width: 50%; }
  .schedule-paid { color: ${COLORS.success}; font-weight: bold; }
  .schedule-pending { color: ${COLORS.muted}; }
  .schedule-link { color: ${COLORS.primary}; font-weight: bold; text-decoration: underline; }

  .payment-callout {
    margin-top: 30pt;
    background: ${COLORS.surface};
    border: 0.5pt solid ${COLORS.primary};
    padding: 10pt 15pt;
    display: flex;
    align-items: center;
    gap: 16pt;
    font-size: 9pt;
  }
  .payment-callout-label { font-weight: bold; }
  .payment-callout-link a { color: ${COLORS.primary}; font-weight: bold; text-decoration: underline; }

  .notes-terms { display: flex; margin-top: 25pt; gap: 30pt; }
  .notes-terms-col { flex: 1; font-size: 9pt; }
  .notes-terms-body { color: ${COLORS.text}; line-height: 1.4; margin-top: 4pt; }

  .directors-line { font-size: 7.5pt; color: ${COLORS.muted}; margin-top: 15pt; }

  .footer { margin-top: 45pt; }
  .footer-qr { display: flex; justify-content: flex-end; margin-bottom: 10pt; }
  .footer-qr img { width: 60pt; height: 60pt; }
  .footer-divider { border-top: 0.5pt solid ${COLORS.divider}; margin-bottom: 12pt; }
  .footer-brand { text-align: center; }
  .footer-brand img { max-width: 495pt; max-height: 16pt; }
  .footer-brand-text { color: ${COLORS.primary}; font-size: 10pt; font-weight: bold; }
  .footer-tagline { color: #94a3b8; font-size: 7pt; margin-top: 6pt; }

  a { text-decoration: none; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="org-block">
        ${invoice.organization.logoDataUri ? `<img class="org-logo" src="${invoice.organization.logoDataUri}" />` : ''}
        <div class="org-name">${escapeHtml(invoice.organization.name)}</div>
        ${renderContactBlock([
          invoice.organization.email,
          invoice.organization.phone,
          invoice.organization.address,
          invoice.organization.rcNumber ? `RC: ${invoice.organization.rcNumber}` : null,
        ])}
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-number">${escapeHtml(invoice.invoiceNumber)}</div>
        <div class="invoice-status" style="color: ${invoice.statusColor};">${escapeHtml(invoice.statusLabel)}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="bill-row">
      <div class="bill-to-block">
        <div class="section-heading">BILL TO</div>
        <div class="client-name">${escapeHtml(invoice.client.name)}</div>
        ${renderContactBlock([invoice.client.email, invoice.client.phone, invoice.client.address])}
      </div>
      <div class="dates-block">
        <div class="date-col">
          <div class="section-heading">ISSUE DATE</div>
          <div class="date-value">${escapeHtml(invoice.issueDateLabel)}</div>
        </div>
        <div class="date-col">
          <div class="section-heading">DUE DATE</div>
          <div class="date-value">${escapeHtml(invoice.dueDateLabel)}</div>
        </div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <td class="col-description">Description</td>
          <td class="col-qty">Qty</td>
          <td class="col-unit-price">Unit Price</td>
          <td class="col-amount">Amount</td>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <div>Subtotal</div>
          <div class="value">${escapeHtml(invoice.subtotalLabel)}</div>
        </div>
        ${invoice.discount ? `
        <div class="totals-row positive">
          <div>${escapeHtml(invoice.discount.label)}</div>
          <div class="value">-${escapeHtml(invoice.discount.amountLabel)}</div>
        </div>` : ''}
        ${invoice.tax ? `
        <div class="totals-row">
          <div>${escapeHtml(invoice.tax.label)}</div>
          <div class="value">${escapeHtml(invoice.tax.amountLabel)}</div>
        </div>` : ''}
        <div class="totals-divider"></div>
        <div class="totals-row total">
          <div>Total</div>
          <div class="value">${escapeHtml(invoice.totalLabel)}</div>
        </div>
        ${invoice.amountPaidLabel ? `
        <div class="totals-row positive">
          <div>Amount Paid</div>
          <div class="value">-${escapeHtml(invoice.amountPaidLabel)}</div>
        </div>` : ''}
        ${invoice.balanceDueLabel ? `
        <div class="totals-row balance">
          <div>Balance Due</div>
          <div class="value">${escapeHtml(invoice.balanceDueLabel)}</div>
        </div>` : ''}
      </div>
    </div>

    ${renderPaymentSection(invoice)}
    ${renderNotesAndTerms(invoice)}
    ${invoice.directorsLine ? `<div class="directors-line">Directors: ${escapeHtml(invoice.directorsLine)}</div>` : ''}

    <div class="footer">
      ${invoice.qrDataUri ? `<div class="footer-qr"><img src="${invoice.qrDataUri}" /></div>` : ''}
      <div class="footer-divider"></div>
      <div class="footer-brand">
        ${invoice.tari1LogoDataUri
          ? `<img src="${invoice.tari1LogoDataUri}" />`
          : `<div class="footer-brand-text">Tari1</div>`}
        ${invoice.showBuiltWith ? `<div class="footer-tagline">Built with Tari1: Work smarter, stay organized. &middot; www.tarione.com</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}
