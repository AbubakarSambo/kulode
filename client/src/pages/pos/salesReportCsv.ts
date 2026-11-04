import type { SalesReport } from '@/api'
import { formatPaymentMethod } from '@/lib/utils'

type Cell = string | number
const esc = (v: Cell) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The sales report as one CSV for accounting tools: each section is a block with its own header
 * row, separated by a blank line. Numbers are plain (no currency symbols or thousands separators).
 */
export function salesReportToCsv(r: SalesReport): string {
  const rows: Cell[][] = []
  const block = (title: string, header: Cell[], body: Cell[][]) => {
    if (rows.length) rows.push([])
    rows.push([title], header, ...body)
  }

  block('Sales report', ['From', 'To', 'Organization'], [[r.from, r.to, r.organizationName]])
  const h = r.headline
  block(
    'Headline',
    ['Gross sales', 'Discounts', 'Net sales', 'Orders', 'Avg check', 'Items sold', 'Items per order', `Change vs ${r.comparison.label} %`],
    [[h.grossSales, h.discounts, h.netSales, h.orders, h.avgCheck, h.itemsSold, h.itemsPerOrder, r.comparison.changePercent ?? '']],
  )
  block(
    'Breakdown by category',
    ['Department', 'Category', 'Qty', '% Qty', 'Revenue', '% Revenue', 'Avg price'],
    r.departments.flatMap((d) => [
      [d.name, '', d.quantity, d.quantityPercent, d.revenue, d.revenuePercent, d.avgPrice],
      ...d.categories.map((c) => [d.name, c.name, c.quantity, c.quantityPercent, c.revenue, c.revenuePercent, c.avgPrice]),
    ]),
  )
  block(
    'Top and bottom items',
    ['Department', 'List', 'Rank', 'Item', 'Qty', 'Revenue'],
    r.departments.flatMap((d) => [
      ...d.topItems.map((i, n) => [d.name, 'Top', n + 1, i.name, i.quantity, i.revenue]),
      ...d.bottomItems.map((i, n) => [d.name, 'Bottom', n + 1, i.name, i.quantity, i.revenue]),
    ]),
  )
  block('Dayparts', ['Daypart', 'From', 'To', 'Orders', 'Sales', '% Sales', 'Avg check'], r.dayparts.map((d) => [d.name, d.start, d.end, d.orders, d.sales, d.salesPercent, d.avgCheck]))
  block('Order types', ['Order type', 'Orders', 'Sales', '% Sales'], r.orderTypes.map((t) => [t.name, t.orders, t.sales, t.salesPercent]))
  block('Payments collected', ['Method', 'Amount', '%'], r.payments.methods.map((m) => [formatPaymentMethod(m.method), m.amount, m.percent]))
  block('Staff', ['Staff', 'Orders', 'Sales', 'Avg check', 'Voids', 'Void amount', 'Discounts'], r.staff.map((s) => [s.name, s.orders, s.sales, s.avgCheck, s.voids, s.voidAmount, s.discounts]))
  block(
    'Controls',
    ['Control', 'Amount', 'Count'],
    [
      ['Voids', r.controls.voids.amount, r.controls.voids.count],
      ['Discounts', r.controls.discounts.amount, r.controls.discounts.count],
    ],
  )

  return rows.map((row) => row.map(esc).join(',')).join('\n')
}

export function downloadSalesReportCsv(r: SalesReport) {
  const blob = new Blob([salesReportToCsv(r)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.from === r.to ? `sales-report-${r.from}.csv` : `sales-report-${r.from}-to-${r.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
