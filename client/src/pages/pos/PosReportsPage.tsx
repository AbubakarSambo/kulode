import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { ReceiptTextIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, DatePicker, EmptyState } from '@/components/ui'
import { posReportsApi } from '@/api'
import { formatCurrency } from '@/lib/utils'

function formatDateToYmd(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PosReportsPage() {
  const today = formatDateToYmd(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)

  const { data: report, isLoading } = useQuery({
    queryKey: ['pos-reports', 'item-sales', from, to],
    queryFn: () => posReportsApi.getItemSales(from, to),
    enabled: !!from,
  })

  const hasSales = !!report && report.products.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Item Sales Report"
        description="Sales and quantities by category and product for a chosen day or date range"
        action={
          <div className="flex items-center gap-2 print:hidden">
            <DatePicker value={from} onChange={setFrom} className="w-36" align="right" placeholder="From" />
            <DatePicker value={to} onChange={setTo} className="w-36" align="right" placeholder="To" />
            {hasSales && (
              <button
                onClick={() => window.print()}
                className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:bg-muted/50 transition-all flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {!isLoading && !hasSales && (
          <EmptyState
            icon={ReceiptTextIcon}
            title="No sales in this range"
            description="Pick a different day or date range to see item sales."
          />
        )}

        {hasSales && report && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center print:block hidden">
              <p className="text-sm font-bold">Item Sales Report</p>
              <p className="text-xs text-muted-foreground">
                {report.from === report.to ? report.from : `${report.from} – ${report.to}`}
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
        )}
      </div>
    </div>
  )
}
