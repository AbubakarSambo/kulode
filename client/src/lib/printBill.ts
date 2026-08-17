import type { ReceiptData } from '@/api/orders'
import { formatCurrency, formatDate } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Renders the same order data the PDF receipt uses as plain print-ready HTML and sends it to
 * `window.print()` via a hidden iframe. Deliberately not the existing PDF — that's generated at a
 * fixed page height (fine for a downloadable document, wrong for a thermal roll printer, which
 * needs the page to grow to fit the content, not the other way around). `@page { size: 80mm auto }`
 * below is what does that. Title says "BILL" when nothing's been paid yet (pre-payment guest
 * check) and "RECEIPT" once a payment exists — same data either way.
 */
export function printBill(receipt: ReceiptData) {
  const isPaid = receipt.payments.length > 0
  const title = isPaid ? 'RECEIPT' : 'BILL'

  const itemRows = receipt.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ''}</td>
          <td class="right">${item.quantity}</td>
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
            padding: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #000;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .name { font-size: 14px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; vertical-align: top; }
          .notes { font-size: 10px; color: #444; }
          .totals td { padding: 1px 0; }
        </style>
      </head>
      <body>
        <div class="center bold name">${escapeHtml(receipt.organization.name)}</div>
        ${receipt.organization.address ? `<div class="center">${escapeHtml(receipt.organization.address)}</div>` : ''}
        ${receipt.organization.phone ? `<div class="center">${escapeHtml(receipt.organization.phone)}</div>` : ''}
        <div class="divider"></div>
        <div class="center bold">${title}</div>
        <div>${escapeHtml(receipt.receiptNumber)}</div>
        <div>${formatDate(receipt.closedAt ?? receipt.createdAt)}</div>
        <div>${escapeHtml(receipt.source.replace('_', ' '))}${receipt.table ? ` · ${escapeHtml(receipt.table.name)}` : ''}</div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr class="bold">
              <td>Item</td>
              <td class="right">Qty</td>
              <td class="right">Amt</td>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div class="divider"></div>
        <table class="totals">
          <tr><td>Subtotal</td><td></td><td class="right">${formatCurrency(receipt.subtotal)}</td></tr>
          <tr><td>Tax</td><td></td><td class="right">${formatCurrency(receipt.taxAmount)}</td></tr>
          <tr class="bold"><td>Total</td><td></td><td class="right">${formatCurrency(receipt.total)}</td></tr>
        </table>
        ${
          isPaid
            ? `<div class="divider"></div><table>${paymentRows}</table>
               <div class="divider"></div>
               <table class="totals bold"><tr><td>Paid</td><td></td><td class="right">${formatCurrency(receipt.amountPaid)}</td></tr></table>`
            : ''
        }
        <div class="divider"></div>
        <div class="center">Thank you!</div>
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
