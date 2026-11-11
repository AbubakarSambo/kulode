// Builds a customer bill / receipt as raw ESC/POS text for a thermal printer — the print-agent
// counterpart of the browser-printed bill in client/src/lib/printBill.ts, laid out the same way.

export interface BillReceipt {
  receiptNumber: string;
  createdAt: Date | string;
  closedAt?: Date | string | null;
  source: string;
  table?: { name: string } | null;
  customer?: { name: string; phone?: string | null } | null;
  waiter?: { firstName: string; lastName: string } | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; amount: number; notes?: string | null }>;
  subtotal: number;
  total: number;
  amountPaid: number;
  discountType?: string | null;
  discountPercent: number;
  discountAmount: number;
  vatApplied: boolean;
  vatRate: number;
  vatAmount: number;
  entertainmentTaxApplied: boolean;
  entertainmentTaxRate: number;
  entertainmentTaxAmount: number;
  serviceChargeApplied: boolean;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  payments: Array<{ amount: number; paymentMethod: string; paymentDate: Date | string }>;
  organization: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    currency?: string | null;
    receiptBankName?: string | null;
    receiptBankAccountNumber?: string | null;
    receiptBankAccountName?: string | null;
  };
}

const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const DOUBLE_HEIGHT_ON = `${GS}!\x01`;
const DOUBLE_HEIGHT_OFF = `${GS}!\x00`;
const CENTER = `${ESC}a\x01`;
const LEFT = `${ESC}a\x00`;
const CUT = `${GS}V\x00`;
const FEED_LINES = '\n\n\n\n\n\n';

/** Characters per line in the printer's standard font: 48 on an 80mm roll, 32 on a 58mm one. */
export function charsPerLine(paperWidthMm: number): number {
  return paperWidthMm === 58 ? 32 : 48;
}

// A thermal printer's built-in font only has plain ASCII — anything else (the naira sign,
// accented letters, curly quotes) prints as a random symbol. Swap in the closest plain character.
function ascii(value: string): string {
  return value
    .replace(/₦/g, 'N')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim();
}

function money(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(rate: number): string {
  return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(1)}%`;
}

function dateTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    let rest = word;
    // A single word longer than the line (a long account name, an email) is cut to fit.
    while (rest.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    if (!current) current = rest;
    else if (current.length + 1 + rest.length <= width) current += ` ${rest}`;
    else {
      lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// "Left text ......... right text" on one line; when the left text is too long it wraps and the
// right text sits on its last line, so an amount always lines up against the right edge.
function row(left: string, right: string, width: number): string {
  const l = ascii(left);
  const r = ascii(right);
  const leftLines = wrap(l, Math.max(width - r.length - 1, 8));
  const last = leftLines.pop() ?? '';
  const gap = Math.max(width - last.length - r.length, 1);
  return [...leftLines, `${last}${' '.repeat(gap)}${r}`].map((line) => `${line}\n`).join('');
}

function centered(text: string, width: number): string {
  return wrap(ascii(text), width)
    .map((line) => `${line}\n`)
    .join('');
}

export function formatBillEscPos(receipt: BillReceipt, paperWidthMm = 80): string {
  const width = charsPerLine(paperWidthMm);
  const divider = `${'-'.repeat(width)}\n`;
  const isPaid = receipt.payments.length > 0;
  const title = isPaid ? 'Receipt' : 'Pro Forma Receipt';
  const org = receipt.organization;
  const currency = ascii(org.currency || 'NGN');
  // Taxes and service charge are worked out on the subtotal after any discount, so that is the
  // base shown next to each rate — otherwise the printed sums don't add up.
  const taxableBase = receipt.subtotal - receipt.discountAmount;
  const out: string[] = [];

  out.push(INIT);
  out.push(CENTER, BOLD_ON, DOUBLE_HEIGHT_ON, centered(org.name, width), DOUBLE_HEIGHT_OFF, BOLD_OFF, LEFT);
  out.push(divider);
  out.push(row('Ticket', receipt.receiptNumber, width));
  out.push(row('Date', dateTime(receipt.closedAt ?? receipt.createdAt), width));
  if (receipt.waiter) out.push(row('Served by', `${receipt.waiter.firstName} ${receipt.waiter.lastName}`, width));
  out.push(`${ascii(receipt.source.replace(/_/g, ' '))}\n`);
  if (receipt.table) out.push(row('Table', receipt.table.name, width));
  if (receipt.customer) {
    const { name, phone } = receipt.customer;
    out.push(row('Customer', phone ? `${name} (${phone})` : name, width));
  }
  out.push(divider);
  out.push(CENTER, BOLD_ON, `${title}\n`, BOLD_OFF, LEFT, '\n');

  for (const item of receipt.items) {
    out.push(BOLD_ON, row(`${item.quantity} x ${item.name}`, money(item.amount), width), BOLD_OFF);
    if (item.quantity > 1) out.push(`    ${money(item.unitPrice)} each\n`);
    if (item.notes) out.push(...wrap(ascii(item.notes), width - 4).map((line) => `    ${line}\n`));
  }

  out.push(divider);
  out.push(row('Subtotal', money(receipt.subtotal), width));
  if (receipt.discountAmount > 0) {
    const label = receipt.discountType === 'PERCENTAGE' ? `Discount (${percent(receipt.discountPercent)})` : 'Discount';
    out.push(row(label, `-${money(receipt.discountAmount)}`, width));
  }
  if (receipt.vatApplied) {
    out.push(row(`VAT ${percent(receipt.vatRate)} on ${money(taxableBase)}`, money(receipt.vatAmount), width));
  }
  if (receipt.entertainmentTaxApplied) {
    out.push(
      row(
        `Ent. Tax ${percent(receipt.entertainmentTaxRate)} on ${money(taxableBase)}`,
        money(receipt.entertainmentTaxAmount),
        width,
      ),
    );
  }
  if (receipt.serviceChargeApplied) {
    out.push(
      row(
        `Service Charge ${percent(receipt.serviceChargeRate)} on ${money(taxableBase)}`,
        money(receipt.serviceChargeAmount),
        width,
      ),
    );
  }
  out.push(BOLD_ON, DOUBLE_HEIGHT_ON, row('TOTAL', `${currency} ${money(receipt.total)}`, width), DOUBLE_HEIGHT_OFF, BOLD_OFF);

  const hasBankDetails = !!(org.receiptBankName || org.receiptBankAccountNumber || org.receiptBankAccountName);
  if (isPaid) {
    out.push(divider);
    for (const payment of receipt.payments) {
      out.push(row(`${payment.paymentMethod} - ${dateTime(payment.paymentDate)}`, money(payment.amount), width));
    }
    out.push(divider);
    out.push(BOLD_ON, row('Paid', `${currency} ${money(receipt.amountPaid)}`, width), BOLD_OFF);
  } else if (hasBankDetails) {
    out.push(divider);
    out.push(CENTER, BOLD_ON, 'Pay by Transfer\n', BOLD_OFF, LEFT);
    if (org.receiptBankName) out.push(row('Bank', org.receiptBankName, width));
    if (org.receiptBankAccountNumber) out.push(row('Account No.', org.receiptBankAccountNumber, width));
    if (org.receiptBankAccountName) out.push(row('Account Name', org.receiptBankAccountName, width));
  }

  out.push(divider);
  out.push(CENTER, 'Thank you for dining with us!\n', '\n');
  if (org.address) out.push(centered(org.address, width));
  if (org.phone) out.push(centered(`Tel: ${org.phone}`, width));
  if (org.email) out.push(centered(org.email, width));
  out.push(LEFT, FEED_LINES, CUT);

  return out.join('');
}
