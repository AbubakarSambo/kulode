import type { Organization, WalletTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Same hidden-iframe + `window.print()` approach as `printBill` — a wallet top-up isn't an order,
 * so it doesn't fit `ReceiptData`, but a customer paying down what they owe still wants a slip
 * confirming the payment and their new balance.
 */
export function printWalletReceipt(tx: WalletTransaction, customerName: string, organization: Organization) {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Wallet Receipt ${escapeHtml(tx.id.slice(0, 8).toUpperCase())}</title>
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
          td { padding: 2px 0; vertical-align: top; }
          .totals td { padding: 3px 0; font-size: 12px; }
          .footer-cols { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: #333; margin-top: 8px; }
          .footer-cols div { flex: 1; }
        </style>
      </head>
      <body>
        <div class="center name">${escapeHtml(organization.name)}</div>
        <div class="divider"></div>
        <table>
          <tr><td class="meta">Receipt</td><td class="right meta">${escapeHtml(tx.id.slice(0, 8).toUpperCase())}</td></tr>
          <tr><td class="meta">Date</td><td class="right meta">${formatDate(tx.createdAt)}</td></tr>
          <tr><td class="meta">Customer</td><td class="right meta">${escapeHtml(customerName)}</td></tr>
          ${tx.createdBy ? `<tr><td class="meta">Received by</td><td class="right meta">${escapeHtml(`${tx.createdBy.firstName} ${tx.createdBy.lastName}`)}</td></tr>` : ''}
        </table>
        <div class="divider"></div>
        <div class="center title">Wallet Payment Received</div>
        <table class="totals">
          <tr><td>Balance before</td><td class="right">${formatCurrency(tx.balanceBefore)}</td></tr>
          <tr class="bold"><td>Amount paid</td><td class="right">${formatCurrency(tx.amount)}</td></tr>
          <tr class="bold"><td>Balance after</td><td class="right">${formatCurrency(tx.balanceAfter)}</td></tr>
        </table>
        ${tx.notes ? `<div class="divider"></div><p class="meta">${escapeHtml(tx.notes)}</p>` : ''}
        <div class="divider"></div>
        <div class="center">Thank you!</div>
        <div class="footer-cols">
          <div>${escapeHtml(organization.name)}${organization.address ? `<br/>${escapeHtml(organization.address)}` : ''}</div>
          <div class="right">${organization.phone ? `Tel: ${escapeHtml(organization.phone)}<br/>` : ''}${organization.email ? escapeHtml(organization.email) : ''}</div>
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
  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  }, 100)
  setTimeout(cleanup, 5000)
}
