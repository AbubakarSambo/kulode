import JsBarcode from 'jsbarcode'
import { formatCurrency } from '@/lib/utils'

// Sized for the 40×30mm die-cut thermal rolls retail shops stick on stock (e.g. an Xprinter
// XP-365B at 203 DPI). Printed through the browser with one label per page at exactly this size,
// so it works with any label printer whose driver is installed — no per-model printer language.
export const LABEL_WIDTH_MM = 40
export const LABEL_HEIGHT_MM = 30

// One print job can't run away into thousands of stickers by a mistyped quantity.
export const MAX_LABELS_PER_PRINT = 500

export interface LabelItem {
  name: string
  barcode: string
  sellPrice?: number | null
}

export interface LabelOptions {
  /** Short shop name printed above the barcode (e.g. "DZYN"); omitted when blank. */
  header?: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Code 128 as SVG markup — the symbology handheld scanners read out of the box. */
export function barcodeSvg(code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, code, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 2 })
  // Stretch to the label's barcode box instead of keeping JsBarcode's pixel size
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('class', 'barcode')
  return svg.outerHTML
}

export const LABEL_CSS = `
  .tl-label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    padding: 1.5mm 2mm;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #000;
    background: #fff;
    text-align: center;
  }
  .tl-label .header { font-size: 7pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.1; }
  /* 28mm leaves the ~10-module quiet zone Code 128 needs either side, even for short codes like "0264" */
  .tl-label .barcode { display: block; width: 28mm; height: 10mm; margin-top: 0.5mm; }
  .tl-label .code { font-size: 9pt; letter-spacing: 0.1em; line-height: 1.2; }
  .tl-label .name { font-size: 7.5pt; line-height: 1.15; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-label .price { font-size: 8.5pt; font-weight: 700; line-height: 1.2; }
`

/** One label's inner markup — shared by the on-screen preview and the printed page. */
export function labelHtml(item: LabelItem, options: LabelOptions): string {
  const header = options.header?.trim()
  return `
    <div class="tl-label">
      ${header ? `<div class="header">${escapeHtml(header)}</div>` : ''}
      ${barcodeSvg(item.barcode)}
      <div class="code">${escapeHtml(item.barcode)}</div>
      <div class="name">${escapeHtml(item.name)}</div>
      ${item.sellPrice != null ? `<div class="price">${formatCurrency(item.sellPrice)}</div>` : ''}
    </div>`
}

/**
 * Prints `copies` labels for each entry, one per 40×30mm page, via a hidden iframe and the
 * browser's print dialog — same pattern as printBill.ts. In the dialog, pick the label printer;
 * the page size is already set to the label, so no scaling or margins should be applied.
 */
export function printLabels(entries: { item: LabelItem; copies: number }[], options: LabelOptions) {
  const labels = entries.flatMap(({ item, copies }) => Array.from({ length: copies }, () => labelHtml(item, options)))
  if (labels.length === 0) return

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Labels</title>
        <style>
          @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
          html, body { margin: 0; padding: 0; }
          ${LABEL_CSS}
          .tl-label { page-break-after: always; break-after: page; }
          .tl-label:last-child { page-break-after: auto; break-after: auto; }
        </style>
      </head>
      <body>${labels.join('')}</body>
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
  setTimeout(cleanup, 60_000)
}
