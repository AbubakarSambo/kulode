import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Info, ChevronDown } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MoneyReceive02Icon,
  Invoice04Icon,
  CheckmarkCircle02Icon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, DropdownPanel, DatePicker } from '@/components/ui'
import { reportsApi, type ReportPeriod } from '@/api/reports'
import { formatCurrency, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { ReportsIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'

const PROGRESS_COLORS = ['bg-[#0037b0]', 'bg-[#0037b0]/85', 'bg-[#0037b0]/70', 'bg-[#0037b0]/55', 'bg-[#0037b0]/40', 'bg-[#0037b0]/25']
const DONUT_COLORS = ['#0037b0', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#6b7280']

const formatAxisY = (value: number) => {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}k`
  return `₦${value}`
}

export function ReportsPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [period, setPeriod] = useState<ReportPeriod>('THIS_YEAR')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false)

  const filters =
    period === 'CUSTOM'
      ? {
          period,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      : { period }

  const { data: cashflow, isLoading } = useQuery({
    queryKey: ['reports', 'cashflow', period, startDate, endDate],
    queryFn: () => reportsApi.getCashflow(filters),
  })

  const { data: expenseBreakdown } = useQuery({
    queryKey: ['reports', 'expenses', period, startDate, endDate],
    queryFn: () => reportsApi.getExpenses(filters),
  })

  const { data: topServicesData } = useQuery({
    queryKey: ['reports', 'top-services', period, startDate, endDate],
    queryFn: () => reportsApi.getTopServices(filters),
  })

  const { data: topProductsData } = useQuery({
    queryKey: ['reports', 'top-products', period, startDate, endDate],
    queryFn: () => reportsApi.getTopProducts(filters),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['reports', 'summary', period, startDate, endDate],
    queryFn: () => reportsApi.getSummary(filters),
  })

  const { data: outstandingData } = useQuery({
    queryKey: ['reports', 'outstanding'],
    queryFn: () => reportsApi.getOutstanding(),
  })

  // Calculate Runway and Average Monthly Burn Rate
  const monthlyBurn = cashflow?.monthly && cashflow.monthly.length > 0
    ? (cashflow.monthly.reduce((sum, m) => sum + m.expenses, 0) / cashflow.monthly.length)
    : 0

  const runwayMonths = monthlyBurn > 0 
    ? ((summaryData?.profit ?? 0) > 0 ? ((summaryData?.profit ?? 0) / monthlyBurn) : 0)
    : null

  const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
    { value: 'THIS_MONTH', label: 'This Month' },
    { value: 'LAST_MONTH', label: 'Last Month' },
    { value: 'THIS_QUARTER', label: 'This Quarter' },
    { value: 'LAST_QUARTER', label: 'Last Quarter' },
    { value: 'THIS_YEAR', label: 'This Year' },
    { value: 'LAST_YEAR', label: 'Last Year' },
    { value: 'CUSTOM', label: 'Custom Range' },
  ]

  const stats = [
    {
      title: "Total Income",
      value: summaryData?.income.total ?? 0,
      subtext: `${summaryData?.income.paymentCount ?? 0} payments`,
      renderIcon: () => <TrendingUp className="h-5 w-5 text-green-600" strokeWidth={1.5} />,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Total Expenses",
      value: summaryData?.expenses.total ?? 0,
      subtext: `${summaryData?.expenses.expenseCount ?? 0} expenses`,
      renderIcon: () => <TrendingDown className="h-5 w-5 text-red-500" strokeWidth={1.5} />,
      color: "text-red-500",
      bgColor: "bg-red-50",
    },
    {
      title: "Net Profit & Margin",
      value: summaryData?.profit ?? 0,
      subtext: `${summaryData?.profitMargin ?? 0}% margin`,
      renderIcon: () => <HugeiconsIcon icon={MoneyReceive02Icon} size={20} color="currentColor" strokeWidth={1.5} className="text-[#0037b0]" />,
      color: "text-[#0037b0]",
      bgColor: "bg-[#0037b0]/[0.08]",
    },
    {
      title: "Outstanding Receivables",
      value: outstandingData?.summary?.totalOutstanding ?? 0,
      subtext: `${outstandingData?.summary?.overdueCount ?? 0} overdue invoices`,
      renderIcon: () => <HugeiconsIcon icon={Invoice04Icon} size={20} color="currentColor" strokeWidth={1.5} className="text-amber-600" />,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Estimated Runway",
      value: runwayMonths !== null ? (runwayMonths > 0 ? `${runwayMonths.toFixed(1)} mos` : '0 mos') : 'N/A',
      isCustomValue: true,
      subtext: `Avg. burn: ${formatCurrency(monthlyBurn)}/mo`,
      renderIcon: () => <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} color="currentColor" strokeWidth={1.5} className="text-emerald-600" />,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      isFullWidthOnMobile: true
    },
  ]

  const renderDropdownSelector = (isOpen: boolean, setIsOpen: (open: boolean) => void, align: 'left' | 'right') => (
    <div className="relative inline-block text-left w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2.5 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[150px] w-full sm:w-auto text-left"
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Calendar03Icon} size={16} color="currentColor" strokeWidth={1.5} className="text-slate-400" />
          <span>{periodOptions.find((opt) => opt.value === period)?.label}</span>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} strokeWidth={1.5} />
      </button>

      <DropdownPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        align={align}
        widthClass="w-full sm:w-48"
        zIndexClass="z-20"
      >
        {periodOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setPeriod(opt.value)
              setIsOpen(false)
              posthog.capture('report_period_changed', { period: opt.value })
            }}
            className={cn(
              "w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
              period === opt.value 
                ? "bg-[#0037b0]/5 text-[#0037b0]" 
                : "text-slate-700 hover:bg-slate-50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </DropdownPanel>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Reports"
        description="Analyze your financial performance"
        icon={ReportsIcon}
        category="Analytics"
        action={
          <div className="flex items-center gap-2">
            {renderDropdownSelector(dropdownOpen, setDropdownOpen, 'right')}
            {period === 'CUSTOM' && (
              <>
                <DatePicker
                  value={startDate}
                  onChange={(val) => setStartDate(val)}
                  className="w-36"
                  align="right"
                />
                <DatePicker
                  value={endDate}
                  onChange={(val) => setEndDate(val)}
                  className="w-36"
                  align="right"
                />
              </>
            )}
          </div>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50/50">
        {/* Mobile Filter selector (Visible only on mobile screen widths) */}
        <div className="flex sm:hidden flex-col gap-3.5 bg-white p-4 rounded-2xl border border-slate-100 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] mb-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Period</span>
            {renderDropdownSelector(mobileDropdownOpen, setMobileDropdownOpen, 'left')}
          </div>
          {period === 'CUSTOM' && (
            <div className="flex flex-col gap-2.5 mt-1 border-t border-slate-50 pt-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-slate-400">Start Date</span>
                <DatePicker
                  value={startDate}
                  onChange={(val) => setStartDate(val)}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-slate-400">End Date</span>
                <DatePicker
                  value={endDate}
                  onChange={(val) => setEndDate(val)}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
              {stats.map((stat) => (
                <Card 
                  key={stat.title}
                  className={cn(
                    "border border-border/80 bg-white hover:-translate-y-0.5 hover:shadow-[0px_12px_24px_rgba(0,55,176,0.04)] transition-all duration-200",
                    stat.isFullWidthOnMobile ? "col-span-2 md:col-span-1" : "col-span-1"
                  )}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                          {stat.title}
                        </p>
                        <p className="mt-1 sm:mt-2 text-base sm:text-xl font-semibold tracking-normal text-slate-800 tabular-nums truncate">
                          {stat.isCustomValue ? stat.value : formatCurrency(Number(stat.value))}
                        </p>
                        <div className="mt-1.5 sm:mt-2 flex items-center">
                          <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded-full truncate">
                            {stat.subtext}
                          </span>
                        </div>
                      </div>
                      <div className={cn("w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shadow-sm shrink-0", stat.bgColor)}>
                        {stat.renderIcon()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Main Layout Grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Cashflow & Tax Compliance (Left 2 columns on desktop) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Cashflow Chart */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                  <CardHeader className="p-6 pb-2">
                    <CardTitle className="text-base font-semibold text-slate-700">Monthly Cashflow</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 pt-0">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cashflow?.monthly ?? []}>
                          <defs>
                            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatAxisY} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(value) => formatCurrency(Number(value))}
                            labelFormatter={(label) => `Month: ${label}`}
                            contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Area type="linear" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} fill="url(#incomeGradient)" dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          <Area type="linear" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expensesGradient)" dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Tax Estimator Card */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                  <CardHeader className="p-6 pb-2">
                    <CardTitle className="text-base font-semibold text-slate-700 flex items-center justify-between">
                      <span>Tax Compliance Estimator</span>
                      <span className="text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2.5 py-1 rounded-full uppercase tracking-wider select-none">
                        FIRS Guidelines
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">VAT Collected (7.5%)</p>
                        <p className="text-lg font-semibold text-[#0037b0] mt-1 tabular-nums">
                          {formatCurrency((summaryData?.income.total ?? 0) * 0.075)}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-1 font-normal">Standard Nigerian rate</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">WHT Credit Estimate</p>
                        <p className="text-lg font-semibold text-amber-650 mt-1 tabular-nums">
                          {formatCurrency((summaryData?.income.total ?? 0) * 0.05)}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-1 font-normal">Avg. 5% source deduction</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Taxable Profit</p>
                        <p className="text-lg font-semibold text-emerald-650 mt-1 tabular-nums">
                          {formatCurrency(summaryData?.profit ?? 0)}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-1 font-normal">Net Earnings YTD</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-[#eef4ff]/25 border border-[#0037b0]/5">
                      <div className="flex items-start gap-2.5">
                        <Info className="h-5 w-5 text-[#0037b0] shrink-0 mt-0.5" strokeWidth={1.5} />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">Need to file your tax return?</p>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">
                            Generate full compliance checklists, CSV schedules, and print tax receipts directly via the Filing Pack page.
                          </p>
                        </div>
                      </div>
                      <Link to="/tax" className="shrink-0 text-xs font-semibold text-[#0037b0] hover:underline flex items-center gap-1 select-none">
                        Filing Pack
                        <span>→</span>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar (Right column on desktop) */}
              <div className="space-y-6">
                {/* Expenses by Category progress bars */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                  <CardHeader className="p-6 pb-2">
                    <CardTitle className="text-base font-semibold text-slate-700">Expenses by Category</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    {expenseBreakdown?.byCategory && expenseBreakdown.byCategory.length > 0 ? (
                      <div className="space-y-4">
                        {expenseBreakdown.byCategory.map((cat: { categoryId: string | null; categoryName: string; total: number; count: number }, i: number) => {
                          const totalExp = expenseBreakdown.byCategory.reduce((sum: number, c: { total: number }) => sum + c.total, 0)
                          const pct = totalExp > 0 ? (cat.total / totalExp) * 100 : 0
                          return (
                            <div key={cat.categoryId || 'uncategorized'} className="space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="text-slate-600 font-medium truncate max-w-[150px]">{cat.categoryName}</span>
                                <div className="text-right flex items-center gap-1.5 shrink-0">
                                  <span className="text-slate-800 font-semibold">{formatCurrency(cat.total)}</span>
                                  <span className="text-slate-400 text-[10px] font-medium">({pct.toFixed(0)}%)</span>
                                </div>
                              </div>
                              <div className="w-full bg-slate-100/70 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={cn(PROGRESS_COLORS[i % PROGRESS_COLORS.length], "h-full rounded-full transition-all duration-500")} 
                                  style={{ width: `${pct}%` }} 
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-xs text-slate-400 font-semibold">No expense records found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top Services & Products */}
                {(!!topServicesData?.services?.length || !!topProductsData?.products?.length) && (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                    {!!topServicesData?.services?.length && (
                      <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                        <CardHeader className="p-6 pb-2">
                          <CardTitle className="text-base font-semibold text-slate-700">Top Services</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={topServicesData.services}
                                  dataKey="revenue"
                                  nameKey="label"
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={45}
                                  outerRadius={70}
                                >
                                  {topServicesData.services.map((_: { label: string; revenue: number; count: number }, i: number) => (
                                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                <Legend formatter={(value) => <span className="text-[10px] font-medium text-slate-500">{value}</span>} iconSize={8} iconType="circle" />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {!!topProductsData?.products?.length && (
                      <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                        <CardHeader className="p-6 pb-2">
                          <CardTitle className="text-base font-semibold text-slate-700">Top Products</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={topProductsData.products}
                                  dataKey="revenue"
                                  nameKey="label"
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={45}
                                  outerRadius={70}
                                >
                                  {topProductsData.products.map((_: { label: string; revenue: number; count: number }, i: number) => (
                                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                <Legend formatter={(value) => <span className="text-[10px] font-medium text-slate-500">{value}</span>} iconSize={8} iconType="circle" />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
