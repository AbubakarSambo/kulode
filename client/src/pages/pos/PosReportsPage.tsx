import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Printer } from 'lucide-react'
import { ReceiptTextIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, DatePicker, DropdownPanel, EmptyState, Input } from '@/components/ui'
import { posReportsApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'

function formatDateToYmd(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type ReportsPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'

const periodOptions: Array<{ value: ReportsPeriod; label: string }> = [
  { value: 'TODAY', label: 'Today' },
  { value: 'THIS_WEEK', label: 'This Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'CUSTOM', label: 'Custom Range' },
]

// Matches the week-start convention used elsewhere in this app (Sunday).
function startOfWeek(d: Date): Date {
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  return start
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function PosReportsPage() {
  const today = formatDateToYmd(new Date())
  const [period, setPeriod] = useState<ReportsPeriod>('THIS_WEEK')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { from, to } = useMemo(() => {
    const now = new Date()
    switch (period) {
      case 'TODAY':
        return { from: today, to: today }
      case 'THIS_WEEK':
        return { from: formatDateToYmd(startOfWeek(now)), to: today }
      case 'THIS_MONTH':
        return { from: formatDateToYmd(startOfMonth(now)), to: today }
      case 'CUSTOM':
        return { from: customFrom, to: customTo }
    }
  }, [period, today, customFrom, customTo])

  // Time-of-day bounds only make sense once you've picked a specific day/range — reset them
  // whenever the period changes away from Custom so a stale time filter doesn't silently apply.
  const effectiveFromTime = period === 'CUSTOM' && fromTime ? fromTime : undefined
  const effectiveToTime = period === 'CUSTOM' && toTime ? toTime : undefined

  const { data: report, isLoading } = useQuery({
    queryKey: ['pos-reports', 'item-sales', from, to, effectiveFromTime, effectiveToTime],
    queryFn: () => posReportsApi.getItemSales(from, to, effectiveFromTime, effectiveToTime),
    enabled: !!from,
  })

  const hasSales = !!report && report.products.length > 0
  const activeOption = periodOptions.find((opt) => opt.value === period)

  // Header's action slot is hidden on mobile (the shared Header component only renders at sm+),
  // so this filter is rendered a second time below for small screens — otherwise it's simply
  // unreachable there.
  const filterControls = (
    <div className="flex items-center gap-2 print:hidden">
      <div className="relative inline-block text-left w-full sm:w-auto">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted/50 transition-all flex items-center justify-between gap-2.5 min-w-[150px] w-full sm:w-auto"
        >
          <span>{activeOption?.label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
        </button>
        <DropdownPanel isOpen={dropdownOpen} onClose={() => setDropdownOpen(false)} align="right" widthClass="w-full sm:w-48" zIndexClass="z-20">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setPeriod(opt.value)
                setDropdownOpen(false)
              }}
              className={cn(
                'w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors block',
                period === opt.value ? 'bg-primary/5 text-primary' : 'text-foreground hover:bg-muted/50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </DropdownPanel>
      </div>
      {period === 'CUSTOM' && (
        <>
          <DatePicker value={customFrom} onChange={setCustomFrom} className="w-36" align="right" placeholder="From" />
          <Input
            type="time"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            className="h-11 w-32"
            aria-label="From time"
          />
          <DatePicker value={customTo} onChange={setCustomTo} className="w-36" align="right" placeholder="To" />
          <Input
            type="time"
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            className="h-11 w-32"
            aria-label="To time"
          />
        </>
      )}
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
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Item Sales Report"
        description="Sales and quantities by category and product for a chosen day or date range"
        action={filterControls}
      />

      <div className="border-b border-border p-4 sm:hidden print:hidden">{filterControls}</div>

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
        )}
      </div>
    </div>
  )
}
