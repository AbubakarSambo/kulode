import type { Organization, WalletTransaction } from '@/types'
import { formatCurrency, formatDate, formatWalletNote } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const WALLET_TRANSACTION_LABELS: Record<WalletTransaction['type'], string> = {
  TOPUP: 'Top Up',
  ORDER_DEBIT: 'Order Payment',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
}

/**
 * Prints a statement of a customer's outstanding wallet balance, listing the debits that make it
 * up, with the org's "pay by transfer" bank details so staff can hand the customer something to
 * settle against. Same hidden-iframe + window.print() pattern as printBill.ts/printWalletReceipt.ts
 * — lets the customer/cashier "Save as PDF" from the browser's print dialog rather than us
 * generating a file. Only meaningful when the balance is negative (customer owes money); callers
 * should gate the action on that.
 */
export function printCustomerStatement(
  customerName: string,
  customerPhone: string | undefined,
  balance: number,
  transactions: WalletTransaction[],
  organization: Organization,
) {
  const amountOwed = Math.abs(Math.min(balance, 0))
  const hasReceiptBankDetails = !!(
    organization.receiptBankName ||
    organization.receiptBankAccountNumber ||
    organization.receiptBankAccountName
  )

  const txRows = transactions
    .map(
      (tx) => `
        <tr>
          <td>${formatDate(tx.createdAt)}</td>
          <td>${escapeHtml(WALLET_TRANSACTION_LABELS[tx.type])}${tx.notes ? ` — ${escapeHtml(formatWalletNote(tx.notes))}` : ''}</td>
          <td class="right">${tx.amount > 0 ? '+' : ''}${formatCurrency(tx.amount)}</td>
        </tr>`,
    )
    .join('')

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Statement — ${escapeHtml(customerName)}</title>
        <style>
          @page { size: A4; margin: 24mm 18mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: #111;
          }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          .org-name { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
          .meta { font-size: 11.5px; color: #444; }
          .title { font-size: 22px; font-weight: 800; text-align: right; }
          .divider { border-top: 1px solid #ddd; margin: 16px 0; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; padding-bottom: 6px; border-bottom: 1px solid #ddd; }
          td { padding: 6px 0; vertical-align: top; border-bottom: 1px solid #f0f0f0; }
          .balance-box { margin-top: 16px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
          .balance-amount { font-size: 24px; font-weight: 800; color: #b91c1c; }
          .pay-box { margin-top: 20px; padding: 16px; border: 1px dashed #999; border-radius: 8px; }
          .pay-box table td { border-bottom: none; padding: 2px 0; }
          .footer { margin-top: 32px; font-size: 10.5px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="org-name">${escapeHtml(organization.name)}</div>
            ${organization.address ? `<div class="meta">${escapeHtml(organization.address)}</div>` : ''}
            ${organization.phone ? `<div class="meta">Tel: ${escapeHtml(organization.phone)}</div>` : ''}
            ${organization.email ? `<div class="meta">${escapeHtml(organization.email)}</div>` : ''}
          </div>
          <div class="title">Statement</div>
        </div>

        <table>
          <tr><td style="border:none; padding:0;" class="meta bold">Customer</td></tr>
          <tr><td style="border:none; padding:0 0 2px;">${escapeHtml(customerName)}${customerPhone ? ` (${escapeHtml(customerPhone)})` : ''}</td></tr>
          <tr><td style="border:none; padding:0;" class="meta">Statement date: ${formatDate(new Date().toISOString())}</td></tr>
        </table>

        <div class="divider"></div>

        ${
          transactions.length > 0
            ? `<table>
                <thead><tr><th>Date</th><th>Description</th><th class="right">Amount</th></tr></thead>
                <tbody>${txRows}</tbody>
              </table>`
            : `<p class="meta">No wallet activity on record.</p>`
        }

        <div class="balance-box">
          <span class="bold">Amount Owed</span>
          <span class="balance-amount">${formatCurrency(amountOwed)}</span>
        </div>

        ${
          hasReceiptBankDetails
            ? `<div class="pay-box">
                <div class="bold" style="margin-bottom: 8px;">Pay by Transfer</div>
                <table>
                  ${organization.receiptBankName ? `<tr><td>Bank</td><td class="right">${escapeHtml(organization.receiptBankName)}</td></tr>` : ''}
                  ${organization.receiptBankAccountNumber ? `<tr><td>Account No.</td><td class="right">${escapeHtml(organization.receiptBankAccountNumber)}</td></tr>` : ''}
                  ${organization.receiptBankAccountName ? `<tr><td>Account Name</td><td class="right">${escapeHtml(organization.receiptBankAccountName)}</td></tr>` : ''}
                </table>
              </div>`
            : ''
        }

        <div class="footer">Please settle the above balance at your earliest convenience. Contact us if you believe this statement is in error.</div>
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
