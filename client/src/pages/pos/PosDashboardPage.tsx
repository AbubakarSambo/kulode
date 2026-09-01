import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ShoppingCart, Users } from 'lucide-react'
import { ReceiptTextIcon } from '@hugeicons/core-free-icons'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, DropdownPanel, DatePicker, EmptyState } from '@/components/ui'
import { posDashboardApi } from '@/api'
import type { ReportPeriod } from '@/api/reports'
import { formatCurrency, cn } from '@/lib/utils'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  PAYSTACK: 'Paystack',
  WALLET: 'Customer Wallet',
  OTHER: 'Other',
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'THIS_QUARTER', label: 'This Quarter' },
  { value: 'THIS_YEAR', label: 'This Year' },
  { value: 'CUSTOM', label: 'Custom Range' },
]

export function PosDashboardPage() {
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const filters =
    period === 'CUSTOM' ? { period, startDate: startDate || undefined, endDate: endDate || undefined } : { period }

  const { data: summary } = useQuery({
    queryKey: ['pos-dashboard', 'summary', period, startDate, endDate],
    queryFn: () => posDashboardApi.getSummary(filters),
    refetchInterval: 15_000,
  })

  const { data: trend } = useQuery({
    queryKey: ['pos-dashboard', 'trend', period, startDate, endDate],
    queryFn: () => posDashboardApi.getTrend(filters),
    refetchInterval: 15_000,
  })

  const activeOption = periodOptions.find((opt) => opt.value === period)
  const change = summary?.sales.change ?? null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Dashboard"
        description="Sales, top items, and waiter performance for your restaurant"
        action={
          <div className="flex items-center gap-2">
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
                <DatePicker value={startDate} onChange={setStartDate} className="w-36" align="right" />
                <DatePicker value={endDate} onChange={setEndDate} className="w-36" align="right" />
              </>
            )}
            <Link to="/pos/order/new">
              <button className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 transition-opacity flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                New Sale
              </button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 sm:p-8">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales</p>
              <p className="mt-1 sm:mt-2 text-lg sm:text-3xl font-semibold text-foreground tabular-nums">
                {formatCurrency(summary?.sales.total ?? 0)}
              </p>
              <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded-full">
                  {summary?.sales.paymentCount ?? 0} payments
                </span>
                {change !== null && period !== 'CUSTOM' && (
                  <span
                    className={cn(
                      'text-[9px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full',
                      change >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50',
                    )}
                  >
                    {change >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {Math.abs(change).toFixed(0)}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-8">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orders</p>
              <p className="mt-1 sm:mt-2 text-lg sm:text-3xl font-semibold text-foreground tabular-nums">
                {summary?.orderCount ?? 0}
              </p>
              <span className="mt-1.5 sm:mt-2 inline-block text-[9px] sm:text-[10px] font-medium text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded-full">
                closed this period
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-8">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg Order Value</p>
              <p className="mt-1 sm:mt-2 text-lg sm:text-3xl font-semibold text-foreground tabular-nums">
                {formatCurrency(summary?.avgOrderValue ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-8">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Method</p>
              <p className="mt-1 sm:mt-2 text-lg sm:text-3xl font-semibold text-foreground truncate">
                {summary?.byPaymentMethod && summary.byPaymentMethod.length > 0
                  ? PAYMENT_METHOD_LABELS[summary.byPaymentMethod[0].method] ?? summary.byPaymentMethod[0].method
                  : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        {trend?.daily && trend.daily.length > 1 && (
          <Card className="mb-8">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold text-foreground flex items-center justify-between">
                <span>Sales Trend</span>
                <span className="text-xs font-semibold text-muted-foreground">{activeOption?.label}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trend.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="posSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0037b0" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0037b0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [formatCurrency(v ?? 0), 'Sales']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #eef4ff', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#0037b0" strokeWidth={2} fill="url(#posSalesGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className="p-8 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                Top Selling Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {summary?.topItems && summary.topItems.length > 0 ? (
                <div className="space-y-3">
                  {summary.topItems.map((item) => (
                    <Link
                      key={item.id}
                      to={`/pos/menu/${item.id}`}
                      className="flex items-center justify-between p-3 rounded-2xl bg-muted/50 hover:bg-muted"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.quantity} sold</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(item.revenue)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ReceiptTextIcon} title="No sales yet" description="Top items will appear once orders close in this period." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-8 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                <Users className="h-5 w-5 text-muted-foreground" />
                Top Staff
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {summary?.topStaff && summary.topStaff.length > 0 ? (
                <div className="space-y-3">
                  {summary.topStaff.map((w) => (
                    <Link
                      key={w.id}
                      to={`/pos/waiters/${w.id}`}
                      className="flex items-center justify-between p-3 rounded-2xl bg-muted/50 hover:bg-muted"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{w.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{w.orders} orders</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(w.revenue)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ReceiptTextIcon} title="No orders yet" description="Top staff will appear once orders close in this period." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-8 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
                Sales by Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {summary?.byPaymentMethod && summary.byPaymentMethod.length > 0 ? (
                <div className="space-y-3">
                  {summary.byPaymentMethod.map((m) => (
                    <div key={m.method} className="flex items-center justify-between p-3 rounded-2xl bg-muted/50">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.count} payments</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(Math.round(m.total))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ReceiptTextIcon} title="No payments yet" description="Payment breakdown will appear once sales come in." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
