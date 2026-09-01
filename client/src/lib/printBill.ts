import type { ReceiptData } from '@/api/orders'
import { formatCurrency, formatDate } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function formatPercent(rate: number): string {
  return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(1)}%`
}

/**
 * Renders the same order data the PDF receipt uses as plain print-ready HTML and sends it to
 * `window.print()` via a hidden iframe. Deliberately not the existing PDF — that's generated at a
 * fixed page height (fine for a downloadable document, wrong for a thermal roll printer, which
 * needs the page to grow to fit the content, not the other way around). `@page { size: 80mm auto }`
 * below is what does that. Title says "Pro Forma Receipt" pre-payment (no payments recorded yet —
 * the guest-check moment) and "Receipt" once a payment exists — matches local POS convention.
 */
export function printBill(receipt: ReceiptData) {
  const isPaid = receipt.payments.length > 0
  const title = isPaid ? 'Receipt' : 'Pro Forma Receipt'
  const waiterName = receipt.waiter ? `${receipt.waiter.firstName} ${receipt.waiter.lastName}` : null
  // Tax/service charge are computed pre-tax, on subtotal minus any discount — shown here rather
  // than the raw subtotal so the printed rate breakdown's math actually adds up.
  const taxableBase = receipt.subtotal - receipt.discountAmount
  const hasReceiptBankDetails = !!(
    receipt.organization.receiptBankName ||
    receipt.organization.receiptBankAccountNumber ||
    receipt.organization.receiptBankAccountName
  )

  const itemRows = receipt.items
    .map(
      (item) => `
        <tr class="item-row">
          <td class="item-no">${item.quantity}</td>
          <td>
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${item.quantity > 1 ? `<div class="item-sub">${formatCurrency(item.unitPrice)} / unit</div>` : ''}
            ${item.notes ? `<div class="item-sub">${escapeHtml(item.notes)}</div>` : ''}
          </td>
          <td class="right">${formatCurrency(item.amount)}</td>
        </tr>`,
    )
    .join('')

  const paymentRows = receipt.payments
    .map(
      (p) => `
        <tr>
          <td colspan="2">${escapeHtml(p.paymentMethod)} — ${formatDate(p.paymentDate)}</td>
          <td class="right">${formatCurrency(p.amount)}</td>
        </tr>`,
    )
    .join('')

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title} ${escapeHtml(receipt.receiptNumber)}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            width: 80mm;
            margin: 0;
            padding: 10px 12px;
            font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 12.5px;
            line-height: 1.45;
            color: #000;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .name { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
          .meta { font-size: 11px; color: #333; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .title { font-size: 14px; font-style: italic; margin: 2px 0 8px; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 1px 0; vertical-align: top; }
          .item-row td { padding-top: 6px; }
          .item-no { width: 16px; font-weight: 700; }
          .item-name { font-weight: 600; }
          .item-sub { font-size: 10.5px; color: #444; }
          .totals td { padding: 2px 0; font-size: 12px; }
          .totals .rate-line td { color: #333; font-size: 11px; }
          .footer-cols { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: #333; margin-top: 8px; }
          .footer-cols div { flex: 1; }
        </style>
      </head>
      <body>
        <div class="center name">${escapeHtml(receipt.organization.name)}</div>
        <div class="divider"></div>
        <table>
          <tr><td class="meta">Ticket</td><td class="right meta">${escapeHtml(receipt.receiptNumber)}</td></tr>
          <tr><td class="meta">Date</td><td class="right meta">${formatDate(receipt.closedAt ?? receipt.createdAt)}</td></tr>
          ${waiterName ? `<tr><td class="meta">Served by</td><td class="right meta">${escapeHtml(waiterName)}</td></tr>` : ''}
          <tr><td class="meta">${escapeHtml(receipt.source.replace('_', ' '))}</td><td class="right meta"></td></tr>
          ${receipt.table ? `<tr><td class="meta">Table</td><td class="right meta">${escapeHtml(receipt.table.name)}</td></tr>` : ''}
        </table>
        <div class="divider"></div>
        <div class="center title">${title}</div>
        <table>${itemRows}</table>
        <div class="divider"></div>
        <table class="totals">
          <tr><td>Subtotal</td><td></td><td class="right">${formatCurrency(receipt.subtotal)}</td></tr>
          ${
            receipt.discountAmount > 0
              ? `<tr><td>Discount${receipt.discountType === 'PERCENTAGE' ? ` (${formatPercent(receipt.discountPercent)})` : ''}</td><td></td><td class="right">−${formatCurrency(receipt.discountAmount)}</td></tr>`
              : ''
          }
          ${
            receipt.vatApplied
              ? `<tr class="rate-line"><td colspan="2">VAT ${formatPercent(receipt.vatRate)} on ${formatCurrency(taxableBase)}</td><td class="right">${formatCurrency(receipt.vatAmount)}</td></tr>`
              : ''
          }
          ${
            receipt.entertainmentTaxApplied
              ? `<tr class="rate-line"><td colspan="2">Ent. Tax ${formatPercent(receipt.entertainmentTaxRate)} on ${formatCurrency(taxableBase)}</td><td class="right">${formatCurrency(receipt.entertainmentTaxAmount)}</td></tr>`
              : ''
          }
          ${
            receipt.serviceChargeApplied
              ? `<tr class="rate-line"><td colspan="2">Service Charge ${formatPercent(receipt.serviceChargeRate)} on ${formatCurrency(taxableBase)}</td><td class="right">${formatCurrency(receipt.serviceChargeAmount)}</td></tr>`
              : ''
          }
          <tr class="bold"><td>Total</td><td></td><td class="right">${formatCurrency(receipt.total)}</td></tr>
        </table>
        ${
          isPaid
            ? `<div class="divider"></div><table class="totals">${paymentRows}</table>
               <div class="divider"></div>
               <table class="totals bold"><tr><td>Paid</td><td></td><td class="right">${formatCurrency(receipt.amountPaid)}</td></tr></table>`
            : hasReceiptBankDetails
              ? `<div class="divider"></div>
                 <div class="center bold">Pay by Transfer</div>
                 <table class="totals">
                   ${receipt.organization.receiptBankName ? `<tr><td>Bank</td><td></td><td class="right">${escapeHtml(receipt.organization.receiptBankName)}</td></tr>` : ''}
                   ${receipt.organization.receiptBankAccountNumber ? `<tr><td>Account No.</td><td></td><td class="right">${escapeHtml(receipt.organization.receiptBankAccountNumber)}</td></tr>` : ''}
                   ${receipt.organization.receiptBankAccountName ? `<tr><td>Account Name</td><td></td><td class="right">${escapeHtml(receipt.organization.receiptBankAccountName)}</td></tr>` : ''}
                 </table>`
              : ''
        }
        <div class="divider"></div>
        <div class="center">Thank you for dining with us!</div>
        <div class="footer-cols">
          <div>${escapeHtml(receipt.organization.name)}${receipt.organization.address ? `<br/>${escapeHtml(receipt.organization.address)}` : ''}</div>
          <div class="right">${receipt.organization.phone ? `Tel: ${escapeHtml(receipt.organization.phone)}<br/>` : ''}${receipt.organization.email ? escapeHtml(receipt.organization.email) : ''}</div>
        </div>
      </body>
    </html>
  `

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  document.body.appendChild(iframe)

  let removed = false
  const cleanup = () => {
    // Give the browser's print dialog time to actually open before the iframe disappears from
    // under it — removing immediately after print() can cancel the job in some browsers. Guarded
    // against running twice since both `afterprint` and the fallback timeout call this.
    setTimeout(() => {
      if (removed || !iframe.parentNode) return
      removed = true
      document.body.removeChild(iframe)
    }, 1000)
  }

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  iframe.contentWindow?.addEventListener('afterprint', cleanup)
  // Not every browser fires `afterprint` inside an iframe reliably — this is the fallback.
  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  }, 100)
  setTimeout(cleanup, 5000)
}
