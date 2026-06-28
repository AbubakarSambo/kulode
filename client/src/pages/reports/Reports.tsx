import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, BarChart, Bar, Cell, Legend, ComposedChart, Line } from 'recharts'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MoneyReceive02Icon,
  Invoice04Icon,
  CheckmarkCircle02Icon,
  Calendar03Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  InformationCircleIcon,
  Cancel01Icon,
  Download02Icon,
  Search01Icon,
  AlertDiamondIcon,
  FilterIcon,
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, DropdownPanel, DatePicker, Button } from '@/components/ui'
import { reportsApi, type ReportPeriod } from '@/api/reports'
import { formatCurrency, cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'
import { ReportsIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'

interface PerformanceItem {
  id: string
  label: string
  revenue: number
  volume: number
  count: number
}

interface ClientConcentrationItem {
  clientId: string
  clientName: string
  total: number
  paymentCount: number
}

interface InsightItem {
  id: string
  type: 'info' | 'warning' | 'critical'
  title: string
  message: string
}

interface ExpenseCategoryItem {
  categoryId: string | null
  categoryName: string
  total: number
  count: number
}

const PROGRESS_COLORS = ['bg-[#0037b0]', 'bg-[#0037b0]/85', 'bg-[#0037b0]/70', 'bg-[#0037b0]/55', 'bg-[#0037b0]/40', 'bg-[#0037b0]/25']
const CHART_COLORS = ['#0037b0', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']

const formatAxisY = (value: number) => {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}k`
  return `₦${value}`
}

export function ReportsPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [activeTab, setActiveTab] = useState<'health' | 'performance' | 'expenses' | 'tax'>('health')
  const [period, setPeriod] = useState<ReportPeriod>('THIS_YEAR')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false)
  const [mobileFilterExpanded, setMobileFilterExpanded] = useState(false)
  const [insightsCollapsed, setInsightsCollapsed] = useState(false)

  // Service & Product performance state
  const [perfType, setPerfType] = useState<'services' | 'products'>('services')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'revenue' | 'volume' | 'count'>('revenue')
  const [sortByOpen, setSortByOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [pageSizeOpen, setPageSizeOpen] = useState(false)

  // Collapsible cards state
  const [cardState, setCardState] = useState({
    cashflow: true,
    expenses: true,
    clients: true,
    paymentMethods: true,
    top5: true,
    performanceList: true,
    taxEstimator: true
  })
  const toggleCard = (key: keyof typeof cardState) => setCardState(prev => ({ ...prev, [key]: !prev[key] }))

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

  const { data: incomeBreakdown } = useQuery({
    queryKey: ['reports', 'income', period, startDate, endDate],
    queryFn: () => reportsApi.getIncome(filters),
  })

  // Calculate Runway and Average Monthly Burn Rate
  const monthlyBurn = cashflow?.monthly && cashflow.monthly.length > 0
    ? (cashflow.monthly.reduce((sum, m) => sum + m.expenses, 0) / cashflow.monthly.length)
    : 0

  const runwayMonths = summaryData?.runwayMonths ?? null

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
      change: summaryData?.income.change,
      targetTab: 'performance',
      renderIcon: () => <HugeiconsIcon icon={ArrowUp01Icon} size={20} className="text-green-600 shrink-0" strokeWidth={1.5} />,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Total Expenses",
      value: summaryData?.expenses.total ?? 0,
      subtext: `${summaryData?.expenses.expenseCount ?? 0} expenses`,
      change: summaryData?.expenses.change,
      isExpense: true,
      targetTab: 'expenses',
      renderIcon: () => <HugeiconsIcon icon={ArrowDown01Icon} size={20} className="text-red-500 shrink-0" strokeWidth={1.5} />,
      color: "text-red-500",
      bgColor: "bg-red-50",
    },
    {
      title: "Net Profit & Margin",
      value: summaryData?.profit ?? 0,
      subtext: `${summaryData?.profitMargin ?? 0}% margin`,
      change: summaryData?.profitChange,
      targetTab: 'performance',
      renderIcon: () => <HugeiconsIcon icon={MoneyReceive02Icon} size={20} color="currentColor" strokeWidth={1.5} className="text-[#0037b0]" />,
      color: "text-[#0037b0]",
      bgColor: "bg-[#0037b0]/[0.08]",
    },
    {
      title: "Outstanding Receivables",
      value: outstandingData?.summary?.totalOutstanding ?? 0,
      subtext: `${outstandingData?.summary?.overdueCount ?? 0} overdue invoices`,
      targetTab: 'performance',
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

  // Filter and sort services/products performance data
  const performanceData = perfType === 'services' ? (topServicesData?.services ?? []) : (topProductsData?.products ?? []);
  
  const filteredAndSortedData = performanceData
    .filter((item: PerformanceItem) => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a: PerformanceItem, b: PerformanceItem) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      if (sortBy === 'volume') return b.volume - a.volume;
      return b.count - a.count;
    });

  const totalRev = performanceData.reduce((sum: number, item: PerformanceItem) => sum + item.revenue, 0);

  // Pagination bounds calculation
  const totalItems = filteredAndSortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredAndSortedData.slice(startIndex, startIndex + pageSize);

  // Top 5 ranking items for chart summary snapshot
  const top5Data = filteredAndSortedData.slice(0, 5).map((item: PerformanceItem) => ({
    name: item.label,
    value: sortBy === 'revenue' ? item.revenue : (sortBy === 'volume' ? item.volume : item.count),
  }));

  const handleExportCSV = () => {
    const filename = `${perfType}-rankings-${period.toLowerCase()}`;
    const headers = ['Rank', 'Item Name', 'Revenue (NGN)', 'Booking Volume (Qty)', 'Transaction Count', 'Average Order Value (AOV)'];
    const rows = filteredAndSortedData.map((item: PerformanceItem, idx: number) => {
      const aov = item.count > 0 ? item.revenue / item.count : 0;
      return [
        idx + 1,
        `"${item.label.replace(/"/g, '""')}"`,
        item.revenue,
        item.volume,
        item.count,
        aov.toFixed(2)
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((e: Array<string | number>) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    posthog.capture('report_csv_exported', { type: perfType, period });
  };

  const handleExportPDF = async () => {
    try {
      await reportsApi.downloadPdf({
        period,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      posthog.capture('report_pdf_exported', { type: perfType, period });
    } catch (error) {
      console.error('Failed to export PDF:', error);
      // Optional: Add toast notification here
    }
  };

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
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} strokeWidth={1.5} />
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

            {/* Export Actions Dropdown */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer"
              >
                <HugeiconsIcon icon={Download02Icon} size={16} strokeWidth={1.5} className="text-slate-500" />
                <span className="hidden sm:inline">Export</span>
                <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", exportDropdownOpen && "rotate-180")} strokeWidth={1.5} />
              </button>

              <DropdownPanel
                isOpen={exportDropdownOpen}
                onClose={() => setExportDropdownOpen(false)}
                align="right"
                widthClass="w-40"
                zIndexClass="z-20"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleExportCSV()
                    setExportDropdownOpen(false)
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <HugeiconsIcon icon={Download02Icon} size={14} className="text-slate-400" />
                  As CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportPDF()
                    setExportDropdownOpen(false)
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-[#0037b0] hover:bg-[#0037b0]/5 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <HugeiconsIcon icon={Download02Icon} size={14} className="text-[#0037b0]" />
                  As PDF
                </button>
              </DropdownPanel>
            </div>
          </div>
        }
      />

      {/* Main Tab Controller Section (Optimized padding) */}
      <div className="flex px-4 sm:px-8 mb-4">
        <div className="flex bg-[#eef4ff] p-1.5 rounded-2xl w-full sm:w-auto overflow-x-auto snap-x snap-mandatory no-scrollbar gap-1 min-h-[48px] items-center">
          <button
            onClick={() => {
              setActiveTab('health')
              posthog.capture('report_tab_switched', { tab: 'health' })
            }}
            className={cn(
              "px-6 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 snap-center",
              activeTab === 'health' 
                ? "bg-white text-[#0037b0] shadow-[0px_4px_12px_rgba(0,55,176,0.04)]" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Executive Summary
          </button>
          <button
            onClick={() => {
              setActiveTab('performance')
              posthog.capture('report_tab_switched', { tab: 'performance' })
            }}
            className={cn(
              "px-6 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 snap-center",
              activeTab === 'performance' 
                ? "bg-white text-[#0037b0] shadow-[0px_4px_12px_rgba(0,55,176,0.04)]" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Revenue & Sales
          </button>
          <button
            onClick={() => {
              setActiveTab('expenses')
              posthog.capture('report_tab_switched', { tab: 'expenses' })
            }}
            className={cn(
              "px-6 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 snap-center",
              activeTab === 'expenses' 
                ? "bg-white text-[#0037b0] shadow-[0px_4px_12px_rgba(0,55,176,0.04)]" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Expense Analysis
          </button>
          <button
            onClick={() => {
              setActiveTab('tax')
              posthog.capture('report_tab_switched', { tab: 'tax' })
            }}
            className={cn(
              "px-6 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 snap-center",
              activeTab === 'tax' 
                ? "bg-white text-[#0037b0] shadow-[0px_4px_12px_rgba(0,55,176,0.04)]" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Tax & Compliance
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-slate-50/50">
        
        {/* Mobile Filter selector (Optimized to sleek toggle) */}
        <div className="flex sm:hidden items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)] mb-4">
          <div className="flex items-center gap-2.5 pl-1.5">
            <div className="bg-[#0037b0]/5 p-2 rounded-xl text-[#0037b0]">
              <HugeiconsIcon icon={Calendar03Icon} size={16} />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Selected Period</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">{periodOptions.find((opt) => opt.value === period)?.label}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setMobileFilterExpanded(!mobileFilterExpanded)}
            className={cn("w-11 h-11 rounded-xl p-0 transition-colors duration-200", mobileFilterExpanded ? "bg-[#0037b0]/5 border-[#0037b0]/20" : "border-slate-200 bg-white")}
          >
            <HugeiconsIcon icon={FilterIcon} size={18} className={cn("transition-colors", mobileFilterExpanded ? "text-[#0037b0]" : "text-slate-500")} />
          </Button>
        </div>

        {/* Expanded Mobile Filters */}
        {mobileFilterExpanded && (
          <div className="flex sm:hidden flex-col gap-3.5 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-4 animate-fadeIn">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Change Period</span>
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
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            
            {/* TAB 1: FINANCIAL HEALTH */}
            {activeTab === 'health' && (
              <div className="space-y-6">
                
                {/* Collapsible Actionable Insights Panel */}
                {summaryData?.insights && summaryData.insights.length > 0 && (
                  <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100/50 shadow-[0px_12px_24px_rgba(0,55,176,0.02)] transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Business Insights
                        </span>
                        <span className="flex items-center justify-center bg-amber-500/10 text-amber-600 text-[9px] font-bold px-2 py-0.5 rounded-full select-none">
                          {summaryData.insights.length} Actionable
                        </span>
                      </div>
                      <button 
                        onClick={() => setInsightsCollapsed(!insightsCollapsed)}
                        className="text-[10px] font-semibold text-[#0037b0] hover:underline cursor-pointer flex items-center gap-1 min-h-[44px]"
                      >
                        {insightsCollapsed ? 'Expand Alerts' : 'Collapse Alerts'}
                        <HugeiconsIcon icon={ArrowDown01Icon} size={14} className={cn("transition-transform duration-200", !insightsCollapsed && "rotate-180")} />
                      </button>
                    </div>

                    {!insightsCollapsed && (
                      <div className="grid gap-3 sm:grid-cols-2 mt-3 animate-fadeIn">
                        {summaryData.insights.map((insight: InsightItem) => {
                          const isCritical = insight.type === 'critical';
                          const isWarning = insight.type === 'warning';
                          return (
                            <div 
                              key={insight.id}
                              className={cn(
                                "p-3.5 rounded-2xl flex items-start gap-3 border shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-all duration-300",
                                isCritical 
                                  ? "bg-red-50/40 border-red-100 text-red-950"
                                  : isWarning 
                                    ? "bg-amber-50/40 border-amber-100 text-amber-950"
                                    : "bg-blue-50/20 border-blue-50 text-blue-950"
                              )}
                            >
                              <HugeiconsIcon 
                                icon={isCritical || isWarning ? AlertDiamondIcon : InformationCircleIcon} 
                                size={18} 
                                className={cn(
                                  "shrink-0 mt-0.5",
                                  isCritical ? "text-red-500" : isWarning ? "text-amber-500" : "text-[#0037b0]"
                                )} 
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold tracking-tight">
                                  {insight.title}
                                </p>
                                <p className="mt-1 text-[10px] font-medium leading-relaxed opacity-85">
                                  {insight.message}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary Cards Grid */}
                <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
                  {stats.map((stat) => (
                    <Card 
                      key={stat.title}
                      onClick={() => stat.targetTab && setActiveTab(stat.targetTab as 'health' | 'performance' | 'expenses' | 'tax')}
                      className={cn(
                        "border border-border/80 bg-white hover:-translate-y-0.5 hover:shadow-[0px_12px_24px_rgba(0,55,176,0.04)] transition-all duration-200",
                        stat.targetTab && "cursor-pointer active:scale-[0.98]",
                        stat.isFullWidthOnMobile ? "col-span-2 md:col-span-1" : "col-span-1"
                      )}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
                              {stat.title}
                            </p>
                            <p className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold tracking-normal text-slate-800 tabular-nums truncate">
                              {stat.isCustomValue ? stat.value : formatCurrency(Number(stat.value))}
                            </p>
                            
                            {/* Growth/Trend Indicators */}
                            {stat.change !== undefined && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <span 
                                  className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0",
                                    (stat.isExpense ? stat.change > 0 : stat.change < 0)
                                      ? "bg-red-50 text-red-650"
                                      : "bg-green-50 text-green-650"
                                  )}
                                >
                                  <HugeiconsIcon 
                                    icon={stat.change > 0 ? ArrowUp01Icon : ArrowDown01Icon} 
                                    size={8} 
                                    strokeWidth={2.5} 
                                    className="shrink-0"
                                  />
                                  {Math.abs(stat.change)}%
                                </span>
                                <span className="text-[8px] text-slate-400 font-semibold truncate">
                                  vs prev
                                </span>
                              </div>
                            )}

                            {stat.change === undefined && (
                              <div className="mt-1.5 flex items-center">
                                <span className="text-[9px] font-medium text-slate-505 bg-slate-100 px-1.5 py-0.5 rounded-full truncate">
                                  {stat.subtext}
                                </span>
                              </div>
                            )}

                          </div>
                          <div className={cn("w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shadow-sm shrink-0", stat.bgColor)}>
                            {stat.renderIcon()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Cashflow Chart (Collapsible) */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                  <CardHeader 
                    className="p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                    onClick={() => toggleCard('cashflow')}
                  >
                    <CardTitle className="text-base font-semibold text-slate-700">Monthly Cashflow</CardTitle>
                    <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.cashflow && "rotate-180")} />
                  </CardHeader>
                  {cardState.cashflow && (
                    <CardContent className="p-6 pt-0 animate-fadeIn">
                      <div className="h-80 mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={cashflow?.monthly ?? []}>
                            <defs>
                              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#006c49" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#006c49" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0037b0" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#0037b0" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c4c5d7" opacity={0.15} />
                            <XAxis 
                              dataKey="month" 
                              stroke="#434655" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false} 
                              tickFormatter={(val) => {
                                if (!val) return '';
                                const d = new Date(val + '-01T00:00:00');
                                return isNaN(d.getTime()) ? val : d.toLocaleString('en-US', { month: 'short' });
                              }}
                            />
                            <YAxis tickFormatter={formatAxisY} stroke="#434655" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                              formatter={(value) => formatCurrency(Number(value))}
                              labelFormatter={(label) => {
                                if (!label) return '';
                                const d = new Date(label + '-01T00:00:00');
                                return isNaN(d.getTime()) ? `Month: ${label}` : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                              }}
                              contentStyle={{
                                background: 'rgba(255, 255, 255, 0.9)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(196, 197, 215, 0.2)',
                                borderRadius: '12px',
                                boxShadow: '0px 8px 24px rgba(0, 55, 176, 0.04)',
                                fontSize: '11px',
                                color: '#121c28'
                              }}
                            />
                            <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 600 }} />
                            <Area type="monotone" dataKey="income" name="Income" stroke="#006c49" strokeWidth={2} fillOpacity={1} fill="url(#incomeGradient)" />
                            <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#0037b0" strokeWidth={2} fillOpacity={1} fill="url(#expensesGradient)" />
                            <Line type="monotone" dataKey="net" name="Net Profit" stroke="#121c28" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#121c28', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  )}
                </Card>

              </div>
            )}

            {/* TAB 2: SERVICE & PRODUCT PERFORMANCE */}
            {activeTab === 'performance' && (
              <div className="space-y-6">
                
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Top Clients Concentration Card (Collapsible) */}
                  <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                    <CardHeader 
                      className="p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                      onClick={() => toggleCard('clients')}
                    >
                      <CardTitle className="text-base font-semibold text-slate-700">Top Revenue Clients</CardTitle>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.clients && "rotate-180")} />
                    </CardHeader>
                    {cardState.clients && (
                      <CardContent className="p-6 pt-0 space-y-4 animate-fadeIn">
                        {incomeBreakdown?.topClients && incomeBreakdown.topClients.length > 0 ? (
                          <div className="space-y-4 mt-2">
                            {incomeBreakdown.topClients.slice(0, 5).map((client: ClientConcentrationItem, i: number) => {
                              const totalInc = incomeBreakdown.topClients.reduce((sum: number, c: ClientConcentrationItem) => sum + c.total, 0)
                              const pct = totalInc > 0 ? (client.total / totalInc) * 100 : 0
                              return (
                                <div key={client.clientId} className="space-y-2">
                                  <div className="flex items-center justify-between text-xs font-semibold">
                                    <span className="text-slate-600 font-medium truncate max-w-[150px]">{client.clientName}</span>
                                    <div className="text-right flex items-center gap-1.5 shrink-0">
                                      <span className="text-slate-800 font-semibold">{formatCurrency(client.total)}</span>
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
                            <p className="text-xs text-slate-400 font-semibold">No billing records found</p>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>

                  {/* Revenue by Payment Method Card (Collapsible) */}
                  <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                    <CardHeader 
                      className="p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                      onClick={() => toggleCard('paymentMethods')}
                    >
                      <CardTitle className="text-base font-semibold text-slate-700">Revenue by Payment Method</CardTitle>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.paymentMethods && "rotate-180")} />
                    </CardHeader>
                    {cardState.paymentMethods && (
                      <CardContent className="p-6 pt-0 space-y-4 animate-fadeIn">
                        {incomeBreakdown?.byPaymentMethod && incomeBreakdown.byPaymentMethod.length > 0 ? (
                          <div className="space-y-4 mt-2">
                            {incomeBreakdown.byPaymentMethod.map((method: { method: string; total: number; count: number }, i: number) => {
                              const totalInc = incomeBreakdown.byPaymentMethod.reduce((sum: number, m: { method: string; total: number; count: number }) => sum + m.total, 0)
                              const pct = totalInc > 0 ? (method.total / totalInc) * 100 : 0
                              
                              // Format the method name (e.g., BANK_TRANSFER -> Bank Transfer)
                              const formattedMethod = method.method ? method.method.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 'Unknown'

                              return (
                                <div key={method.method || 'unknown'} className="space-y-2">
                                  <div className="flex items-center justify-between text-xs font-semibold">
                                    <span className="text-slate-600 font-medium truncate max-w-[150px]">{formattedMethod}</span>
                                    <div className="text-right flex items-center gap-1.5 shrink-0">
                                      <span className="text-slate-800 font-semibold">{formatCurrency(method.total)}</span>
                                      <span className="text-slate-400 text-[10px] font-medium">({pct.toFixed(0)}%)</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-slate-100/70 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className={cn(PROGRESS_COLORS[(i + 2) % PROGRESS_COLORS.length], "h-full rounded-full transition-all duration-500")} 
                                      style={{ width: `${pct}%` }} 
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-xs text-slate-400 font-semibold">No payment records found</p>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                </div>

                {/* 1. Global Segmented controls and filter options (Moved to top!) */}
                <div className="bg-white p-4 rounded-3xl border border-slate-100/50 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] flex flex-col gap-4">
                  {/* Top row: services vs products toggle & export button */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    {/* Toggle Services vs Products */}
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto min-h-[44px] items-center">
                      <button
                        onClick={() => {
                          setPerfType('services')
                          setCurrentPage(1)
                          setExpandedRows({})
                        }}
                        className={cn(
                          "flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px]",
                          perfType === 'services' 
                            ? "bg-white text-slate-800 shadow-[0_2px_4px_rgba(0,0,0,0.05)]" 
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Services Rankings
                      </button>
                      <button
                        onClick={() => {
                          setPerfType('products')
                          setCurrentPage(1)
                          setExpandedRows({})
                        }}
                        className={cn(
                          "flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px]",
                          perfType === 'products' 
                            ? "bg-white text-slate-800 shadow-[0_2px_4px_rgba(0,0,0,0.05)]" 
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Inventory Products
                      </button>
                    </div>
                  </div>

                  {/* Bottom row: search filters and sorting */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Search Field */}
                    <div className="relative col-span-1 sm:col-span-2">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="text-slate-400" />
                      </span>
                      <input
                        type="text"
                        placeholder={`Search ${perfType} by name...`}
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          setCurrentPage(1)
                          setExpandedRows({})
                        }}
                        className="h-11 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#0037b0] transition-all min-h-[44px]"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => {
                            setSearchQuery('')
                            setCurrentPage(1)
                            setExpandedRows({})
                          }}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center cursor-pointer text-slate-400 hover:text-slate-655 min-h-[44px]"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={14} />
                        </button>
                      )}
                    </div>

                    {/* Sorting dropdown */}
                    <div className="relative inline-block text-left w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setSortByOpen(!sortByOpen)}
                        className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2.5 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer w-full min-h-[44px] text-left"
                      >
                        <span className="truncate">
                          {sortBy === 'revenue' ? 'Sort by Revenue (₦)' : sortBy === 'volume' ? 'Sort by Booking Volume (Qty)' : 'Sort by Invoice Count'}
                        </span>
                        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0", sortByOpen && "rotate-180")} strokeWidth={1.5} />
                      </button>

                      <DropdownPanel
                        isOpen={sortByOpen}
                        onClose={() => setSortByOpen(false)}
                        align="right"
                        widthClass="w-full sm:w-64"
                        zIndexClass="z-20"
                      >
                        {[
                          { value: 'revenue', label: 'Sort by Revenue (₦)' },
                          { value: 'volume', label: 'Sort by Booking Volume (Qty)' },
                          { value: 'count', label: 'Sort by Invoice Count' }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setSortBy(opt.value as 'revenue' | 'volume' | 'count');
                              setCurrentPage(1);
                              setExpandedRows({});
                              setSortByOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-4 py-3 text-xs font-semibold transition-colors block cursor-pointer",
                              sortBy === opt.value 
                                ? "bg-[#0037b0]/5 text-[#0037b0]" 
                                : "text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </DropdownPanel>
                    </div>
                  </div>
                </div>

                {/* 2. Top 5 Snapshot horizontal chart (Collapsible and Gradient Fixed) */}
                {filteredAndSortedData.length > 0 && (
                  <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                    <CardHeader 
                      className="p-4 sm:p-5 pb-3 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                      onClick={() => toggleCard('top5')}
                    >
                      <CardTitle className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider">
                        Top 5 {perfType === 'services' ? 'Services' : 'Products'} Snapshot
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <div className="relative group/pill flex items-center gap-1.5 text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 hover:bg-[#0037b0]/10 transition-colors px-2.5 py-1 rounded-full uppercase select-none cursor-help">
                          <span>By {sortBy === 'revenue' ? 'Revenue' : (sortBy === 'volume' ? 'Volume' : 'Bookings')}</span>
                          <HugeiconsIcon icon={InformationCircleIcon} size={12} className="opacity-70" />
                          
                          {/* Tooltip Popup */}
                          <div className="pointer-events-none opacity-0 group-hover/pill:opacity-100 transition-opacity duration-200 absolute bottom-[calc(100%+6px)] right-0 w-48 p-2.5 bg-slate-800 text-white rounded-lg shadow-xl text-[10px] leading-relaxed z-50 text-left normal-case font-medium">
                            {sortBy === 'revenue' && 'Ranks items by total monetary value generated.'}
                            {sortBy === 'volume' && 'Ranks items by the total quantity sold/booked.'}
                            {sortBy === 'count' && 'Ranks items by the total number of unique invoices they appear on.'}
                            <div className="absolute top-full right-6 border-4 border-transparent border-t-slate-800" />
                          </div>
                        </div>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={18} className={cn("text-slate-400 transition-transform duration-200", cardState.top5 && "rotate-180")} />
                      </div>
                    </CardHeader>
                    {cardState.top5 && (
                      <CardContent className="p-0 animate-fadeIn">
                        <div className="h-44 sm:h-52 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={top5Data}
                              layout="vertical"
                              margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
                            >
                              <defs>
                                {CHART_COLORS.map((color, idx) => (
                                  <linearGradient key={`grad-${idx}`} id={`barGrad${idx}`} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                                    <stop offset="100%" stopColor={color} stopOpacity={1} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" tickFormatter={(v) => sortBy === 'revenue' ? formatAxisY(v) : v.toString()} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#64748b' }} width={120} axisLine={false} tickLine={false} />
                              <Tooltip
                                formatter={(value) => [sortBy === 'revenue' ? formatCurrency(Number(value)) : `${value} units`, 'Value']}
                                contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: 10 }}
                              />
                              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                                {top5Data.map((_item: { name: string; value: number }, index: number) => (
                                  <Cell key={`cell-${index}`} fill={`url(#barGrad${index % CHART_COLORS.length})`} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* 3. Performance list card (Collapsible) */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px] overflow-hidden">
                  <CardHeader 
                    className="p-4 sm:p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                    onClick={() => toggleCard('performanceList')}
                  >
                    <CardTitle className="text-sm font-semibold text-slate-700">Detailed Rankings</CardTitle>
                    <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.performanceList && "rotate-180")} />
                  </CardHeader>
                  
                  {cardState.performanceList && (
                    <CardContent className="p-4 sm:p-6 pt-0 animate-fadeIn">
                      {filteredAndSortedData.length > 0 ? (
                        <div className="flex flex-col mt-2">
                          
                          {/* Mobile Card controls */}
                          <div className="md:hidden flex items-center justify-between mb-3 px-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Showing {totalItems} items
                            </span>
                            <button
                              onClick={() => {
                                const allExpanded = paginatedData.every((item: PerformanceItem) => expandedRows[item.id || '']);
                                const nextState: Record<string, boolean> = {};
                                paginatedData.forEach((item: PerformanceItem) => {
                                  nextState[item.id || ''] = !allExpanded;
                                });
                                setExpandedRows(nextState);
                              }}
                              className="text-[9px] font-bold text-[#0037b0] hover:underline cursor-pointer flex items-center gap-1 min-h-[32px]"
                            >
                              {paginatedData.every((item: PerformanceItem) => expandedRows[item.id || '']) ? 'Collapse All Cards' : 'Expand All Cards'}
                            </button>
                          </div>

                          <div className="overflow-x-auto min-w-full">
                            {/* Desktop view (visible above 768px) */}
                            <table className="hidden md:table w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  <th className="py-3 px-4 w-12 text-center rounded-l-xl">Rank</th>
                                  <th className="py-3 px-4">Item Name</th>
                                  <th className="py-3 px-4 text-right">Revenue</th>
                                  <th className="py-3 px-4 text-right">Booking Volume</th>
                                  <th className="py-3 px-4 text-right">Transactions</th>
                                  <th className="py-3 px-4 text-right">Avg Value (AOV)</th>
                                  <th className="py-3 px-4 w-40 rounded-r-xl">Share</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y-0">
                                {paginatedData.map((item: PerformanceItem, idx: number) => {
                                  const aov = item.count > 0 ? item.revenue / item.count : 0;
                                  const sharePct = totalRev > 0 ? (item.revenue / totalRev) * 100 : 0;
                                  const absoluteRank = startIndex + idx + 1;
                                  return (
                                    <tr 
                                      key={item.id || idx} 
                                      className={cn(
                                        "text-xs font-semibold hover:bg-slate-50/50 transition-colors",
                                        idx % 2 === 1 && "bg-slate-50/20"
                                      )}
                                    >
                                      <td className="py-4 px-4 text-center font-bold text-slate-400">#{absoluteRank}</td>
                                      <td className="py-4 px-4 font-semibold text-slate-700">{item.label}</td>
                                      <td className="py-4 px-4 text-right text-slate-900 font-bold tabular-nums">{formatCurrency(item.revenue)}</td>
                                      <td className="py-4 px-4 text-right text-slate-650 tabular-nums">{item.volume} units</td>
                                      <td className="py-4 px-4 text-right text-slate-500 tabular-nums">{item.count}</td>
                                      <td className="py-4 px-4 text-right text-[#0037b0] tabular-nums">{formatCurrency(aov)}</td>
                                      <td className="py-4 px-4">
                                        <div className="flex items-center gap-2">
                                          <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
                                            <div className="bg-[#0037b0] h-full rounded-full" style={{ width: `${sharePct}%` }} />
                                          </div>
                                          <span className="text-[10px] text-slate-400 tabular-nums">{sharePct.toFixed(0)}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>

                            {/* Mobile Accordion view (visible below 768px) */}
                            <div className="md:hidden space-y-2.5">
                              {paginatedData.map((item: PerformanceItem, idx: number) => {
                                const aov = item.count > 0 ? item.revenue / item.count : 0;
                                const itemId = item.id || `row-${idx}`;
                                const isExpanded = !!expandedRows[itemId];
                                const absoluteRank = startIndex + idx + 1;
                                const sharePct = totalRev > 0 ? (item.revenue / totalRev) * 100 : 0;
                                
                                // Determine the primary statistic shown inline based on active sorting choice
                                const activeMetricValue = 
                                  sortBy === 'revenue' 
                                    ? formatCurrency(item.revenue) 
                                    : sortBy === 'volume' 
                                      ? `${item.volume} units` 
                                      : `${item.count} items`;

                                return (
                                  <div 
                                    key={itemId}
                                    className={cn(
                                      "p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer select-none",
                                      isExpanded 
                                        ? "bg-[#eef4ff]/20 border-[#0037b0]/20 shadow-[0_4px_12px_rgba(0,55,176,0.01)]" 
                                        : "bg-white border-slate-100 hover:border-[#0037b0]/10"
                                    )}
                                    onClick={() => setExpandedRows(prev => ({ ...prev, [itemId]: !prev[itemId] }))}
                                  >
                                    <div className="flex items-center justify-between min-h-[44px]">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xs font-bold text-slate-400 w-6 shrink-0">#{absoluteRank}</span>
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-slate-700 truncate">{item.label}</p>
                                          <div className="flex items-center gap-2 mt-1 w-28 xs:w-36">
                                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden shrink-0">
                                              <div className="bg-[#0037b0] h-full rounded-full" style={{ width: `${sharePct}%` }} />
                                            </div>
                                            <span className="text-[9px] text-slate-400 tabular-nums">{sharePct.toFixed(0)}%</span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-bold text-slate-900 tabular-nums">{activeMetricValue}</span>
                                        <HugeiconsIcon 
                                          icon={ArrowDown01Icon} 
                                          size={16} 
                                          className={cn("text-slate-400 transition-transform duration-200", isExpanded && "rotate-180")} 
                                        />
                                      </div>
                                    </div>

                                    {/* Expanded slide-down details */}
                                    {isExpanded && (
                                      <div 
                                        className="mt-3.5 pt-3.5 border-t border-slate-100/50 grid grid-cols-2 gap-y-3.5 gap-x-2 text-[10px] font-semibold text-slate-500 animate-fadeIn"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div>
                                          <p className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Revenue</p>
                                          <p className="text-slate-800 text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(item.revenue)}</p>
                                        </div>
                                        <div>
                                          <p className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Booking Volume</p>
                                          <p className="text-slate-800 text-sm font-bold mt-0.5 tabular-nums">{item.volume} units</p>
                                        </div>
                                        <div>
                                          <p className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Transactions</p>
                                          <p className="text-slate-800 text-sm font-bold mt-0.5 tabular-nums">{item.count} bookings</p>
                                        </div>
                                        <div>
                                          <p className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Avg Order Value (AOV)</p>
                                          <p className="text-[#0037b0] text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(aov)}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                          </div>

                        </div>
                      ) : (
                        <div className="text-center py-12 mt-2">
                          <p className="text-xs text-slate-400 font-semibold">No records found matching your filters</p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>

                {/* Standardized Platform Pagination & Limit Selector (Moved outside card) */}
                {cardState.performanceList && totalItems > 0 && (
                  <>
                    {/* Desktop Pagination */}
                    <div className="hidden md:flex mt-2 px-2 flex-row items-center justify-between gap-4 select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-semibold">Show:</span>
                        <div className="relative inline-block text-left">
                          <button
                            onClick={() => setPageSizeOpen(!pageSizeOpen)}
                            className="h-9 px-3.5 rounded-xl border border-transparent hover:border-slate-200 bg-transparent hover:bg-white text-xs font-semibold text-slate-600 transition-all flex items-center justify-between gap-2 cursor-pointer min-w-[120px]"
                          >
                            <span>{pageSize} per page</span>
                            <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", pageSizeOpen && "rotate-180")} strokeWidth={1.5} />
                          </button>

                          <DropdownPanel
                            isOpen={pageSizeOpen}
                            onClose={() => setPageSizeOpen(false)}
                            align="left"
                            widthClass="w-full min-w-[120px]"
                            zIndexClass="z-20"
                            animateDirection="bottom"
                            className="bottom-11"
                          >
                            {([5, 10, 15, 25] as const).map((val) => (
                              <button
                                key={val}
                                onClick={() => {
                                  setPageSize(val);
                                  setCurrentPage(1);
                                  setExpandedRows({});
                                  setPageSizeOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3.5 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
                                  pageSize === val 
                                    ? "bg-[#0037b0]/5 text-[#0037b0]" 
                                    : "text-slate-700 hover:bg-slate-50"
                                )}
                              >
                                {val} per page
                              </button>
                            ))}
                          </DropdownPanel>
                        </div>
                      </div>
                      
                      {totalPages >= 1 && (
                        <div className="flex items-center gap-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="h-8 rounded-lg text-xs font-semibold text-[#0037b0] hover:bg-[#0037b0]/5 cursor-pointer disabled:text-slate-400 disabled:hover:bg-transparent"
                          >
                            Previous
                          </Button>
                          <span className="text-xs text-slate-600 font-medium mx-1">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="h-8 rounded-lg text-xs font-semibold text-[#0037b0] hover:bg-[#0037b0]/5 cursor-pointer disabled:text-slate-400 disabled:hover:bg-transparent"
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Mobile Load More Button (Unified Pattern) */}
                    {totalItems > pageSize && (
                      <div className="mt-2 md:hidden flex justify-center w-full px-1 select-none">
                        <Button
                          onClick={() => setPageSize((prev) => prev + 5)}
                          variant="outline"
                          className="w-full py-4 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all min-h-[44px]"
                        >
                          Load More {perfType === 'services' ? 'Services' : 'Products'} ({totalItems - pageSize} remaining)
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 3: EXPENSE ANALYSIS */}
            {activeTab === 'expenses' && (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Category Expenses breakdown (Collapsible) */}
                  <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                    <CardHeader 
                      className="p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                      onClick={() => toggleCard('expenses')}
                    >
                      <CardTitle className="text-base font-semibold text-slate-700">Expenses by Category</CardTitle>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.expenses && "rotate-180")} />
                    </CardHeader>
                    {cardState.expenses && (
                      <CardContent className="p-6 pt-0 space-y-4 animate-fadeIn">
                        {expenseBreakdown?.byCategory && expenseBreakdown.byCategory.length > 0 ? (
                          <div className="space-y-4 mt-2">
                            {expenseBreakdown.byCategory.map((cat: ExpenseCategoryItem, i: number) => {
                              const totalExp = expenseBreakdown.byCategory.reduce((sum: number, c: ExpenseCategoryItem) => sum + c.total, 0)
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
                    )}
                  </Card>
                </div>
              </div>
            )}

            {/* TAB 4: TAX & COMPLIANCE */}
            {activeTab === 'tax' && (
              <div className="space-y-6">
                
                {/* Tax Estimator Card (Collapsible) */}
                <Card className="border border-border/80 bg-white shadow-[0_4px_12px_rgba(0,55,176,0.01)] rounded-[24px]">
                  <CardHeader 
                    className="p-6 pb-2 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-slate-50/50 transition-colors rounded-t-[24px]"
                    onClick={() => toggleCard('taxEstimator')}
                  >
                    <CardTitle className="text-base font-semibold text-slate-700 flex items-center justify-between w-full">
                      <span>Tax Compliance Estimator</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold text-[#0037b0] bg-[#0037b0]/5 px-2.5 py-1 rounded-full uppercase tracking-wider select-none hidden sm:inline-block">
                          FIRS Guidelines
                        </span>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={20} className={cn("text-slate-400 transition-transform duration-200", cardState.taxEstimator && "rotate-180")} />
                      </div>
                    </CardTitle>
                  </CardHeader>

                  {cardState.taxEstimator && (
                    <CardContent className="p-6 pt-0 space-y-4 animate-fadeIn">
                      <div className="grid gap-4 sm:grid-cols-3 mt-2">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100/50">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">VAT Collected (7.5%)</p>
                          <p className="text-lg font-semibold text-[#0037b0] mt-1 tabular-nums">
                            {formatCurrency((summaryData?.income.total ?? 0) * 0.075)}
                          </p>
                          <p className="text-[9px] text-slate-450 mt-1 font-normal">Standard Nigerian rate</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100/50">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">WHT Credit Estimate</p>
                          <p className="text-lg font-semibold text-amber-600 mt-1 tabular-nums">
                            {formatCurrency((summaryData?.income.total ?? 0) * 0.05)}
                          </p>
                          <p className="text-[9px] text-slate-450 mt-1 font-normal">Avg. 5% source deduction</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100/50">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Taxable Profit</p>
                          <p className="text-lg font-semibold text-emerald-650 mt-1 tabular-nums">
                            {formatCurrency(summaryData?.profit ?? 0)}
                          </p>
                          <p className="text-[9px] text-slate-455 mt-1 font-normal">Net Earnings YTD</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#eef4ff]/25 border border-[#0037b0]/5">
                        <div className="flex items-start gap-2.5">
                          <HugeiconsIcon icon={InformationCircleIcon} className="h-5 w-5 text-[#0037b0] shrink-0 mt-0.5" strokeWidth={1.5} />
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
                  )}
                </Card>

              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
