import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import type { ItemSalesReport } from '@/api'
import { formatCurrency } from '@/lib/utils'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** The original item-sales report: sales and quantities by category and product. */
export function ItemSalesReportView({ report }: { report: ItemSalesReport }) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center print:block hidden">
        <p className="text-sm font-bold">Item Sales Report</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(report.period.startDate)} – {formatDateTime(report.period.endDate)}
        </p>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-base font-bold text-foreground">Sales by Item Group</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-2">Category</th>
                <th className="py-2 text-right">%</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.salesByCategory.map((row) => (
                <tr key={row.category} className="font-semibold">
                  <td className="py-2.5">{row.category}</td>
                  <td className="py-2.5 text-right text-muted-foreground tabular-nums">{row.percent.toFixed(2)}%</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t border-border">
                <td className="py-2.5">Total</td>
                <td></td>
                <td className="py-2.5 text-right tabular-nums">{formatCurrency(report.totalSales)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-base font-bold text-foreground">Quantities by Item Group</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-2">Category</th>
                <th className="py-2 text-right">%</th>
                <th className="py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.quantitiesByCategory.map((row) => (
                <tr key={row.category} className="font-semibold">
                  <td className="py-2.5">{row.category}</td>
                  <td className="py-2.5 text-right text-muted-foreground tabular-nums">{row.percent.toFixed(2)}%</td>
                  <td className="py-2.5 text-right tabular-nums">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t border-border">
                <td className="py-2.5">Total</td>
                <td></td>
                <td className="py-2.5 text-right tabular-nums">{report.totalQuantity}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-base font-bold text-foreground">Product</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-2">Product</th>
                <th className="py-2 text-right">Quantity</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.products.map((row) => (
                <tr key={row.name} className="font-semibold">
                  <td className="py-2.5">{row.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{row.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t border-border">
                <td className="py-2.5">Total</td>
                <td></td>
                <td className="py-2.5 text-right tabular-nums">{formatCurrency(report.totalSales)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-base font-bold text-foreground">General Information</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2 space-y-2 text-xs">
          <div className="flex items-center justify-between font-semibold">
            <span className="text-muted-foreground">Orders</span>
            <span className="tabular-nums">{report.orders}</span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span className="text-muted-foreground">Cashier(s)</span>
            <span>{report.cashiers.length > 0 ? report.cashiers.join(', ') : '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
