import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Download, Printer } from 'lucide-react'
import { ReceiptTextIcon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { DatePicker, DropdownPanel, EmptyState, Input } from '@/components/ui'
import { posReportsApi, salesReportApi, organizationsApi } from '@/api'
import { cn } from '@/lib/utils'
import { can } from '@/lib/permissions'
import { printWithTitle, reportFileTitle } from '@/lib/printWithTitle'
import {
  REPORT_PERIOD_OPTIONS as periodOptions,
  formatYmd as formatDateToYmd,
  reportPeriodRange,
  businessToday,
  type ReportsPeriod,
} from '@/lib/reportPeriods'
import { useAuthStore } from '@/stores/auth'
import { ItemSalesReportView } from './ItemSalesReportView'
import { SalesReportView } from './SalesReportView'
import { downloadSalesReportCsv } from './salesReportCsv'

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
  const { data: organization } = useQuery({ queryKey: ['organization'], queryFn: () => organizationsApi.getCurrent() })
  const today = formatDateToYmd(businessToday(new Date(), organization?.shiftStartTime))
  const [period, setPeriod] = useState<ReportsPeriod>('TODAY')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Admins get the redesigned Sales report (default) and can flip to the original Item sales
  // view; everyone else only ever sees Item sales. The API enforces the same split.
  const user = useAuthStore((state) => state.user)
  const canSeeSalesReport = can(user, 'POS_SALES_REPORT_VIEW')
  const [searchParams, setSearchParams] = useSearchParams()
  const view: 'sales' | 'items' = canSeeSalesReport && searchParams.get('view') !== 'items' ? 'sales' : 'items'
  const setView = (v: 'sales' | 'items') => setSearchParams(v === 'items' ? { view: 'items' } : {}, { replace: true })

  const shiftStartTime = organization?.shiftStartTime
  const { from, to } = useMemo(
    () => (period === 'CUSTOM' ? { from: customFrom, to: customTo } : reportPeriodRange(period, new Date(), shiftStartTime)),
    [period, customFrom, customTo, shiftStartTime],
  )

  // Time-of-day bounds only make sense once you've picked a specific day/range — reset them
  // whenever the period changes away from Custom so a stale time filter doesn't silently apply.
  const effectiveFromTime = period === 'CUSTOM' && fromTime ? fromTime : undefined
  const effectiveToTime = period === 'CUSTOM' && toTime ? toTime : undefined

  // Anything else lets the server pick: a day or week vs the same days last week, longer ranges vs
  // the period just before.
  const compare = period === 'THIS_MONTH' ? 'month' : undefined

  const { data: report, isLoading: salesLoading } = useQuery({
    queryKey: ['pos-reports', 'sales-report', from, to, effectiveFromTime, effectiveToTime, compare],
    queryFn: () =>
      salesReportApi.get({
        from,
        to,
        fromTime: effectiveFromTime,
        toTime: effectiveToTime,
        compare,
      }),
    enabled: !!from && view === 'sales',
  })

  const { data: itemReport, isLoading: itemsLoading } = useQuery({
    queryKey: ['pos-reports', 'item-sales', from, to, effectiveFromTime, effectiveToTime],
    queryFn: () => posReportsApi.getItemSales(from, to, effectiveFromTime, effectiveToTime),
    enabled: !!from && view === 'items',
  })

  const isLoading = view === 'sales' ? salesLoading : itemsLoading
  const hasSales = view === 'sales' ? !!report && report.headline.orders > 0 : !!itemReport && itemReport.products.length > 0
  const activeOption = periodOptions.find((opt) => opt.value === period)

  const filterControls = (
    <div className="flex items-center gap-2 print:hidden">
      {canSeeSalesReport && (
        <div className="h-11 p-1 rounded-xl border border-border bg-card flex items-center gap-1">
          {(
            [
              ['sales', 'Sales report'],
              ['items', 'Item sales'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={cn(
                'h-full px-3 rounded-lg text-xs font-semibold transition-colors',
                view === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="relative inline-block text-left w-full sm:w-auto">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted/50 transition-all flex items-center justify-between gap-2.5 min-w-[150px] w-full sm:w-auto"
        >
          <span>{activeOption?.label}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
        </button>
        <DropdownPanel
          isOpen={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          align="right"
          widthClass="w-full sm:w-48"
          zIndexClass="z-20"
        >
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
          <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="h-11 w-32" aria-label="From time" />
          <DatePicker value={customTo} onChange={setCustomTo} className="w-36" align="right" placeholder="To" />
          <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="h-11 w-32" aria-label="To time" />
        </>
      )}
      {hasSales && (
        <>
          {view === 'sales' && report && (
            <button
              onClick={() => downloadSalesReportCsv(report)}
              className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:bg-muted/50 transition-all flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          )}
          <button
            onClick={() =>
              printWithTitle(reportFileTitle(organization?.name, view === 'sales' ? 'Sales Report' : 'Item Sales Report', from, to))
            }
            className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:bg-muted/50 transition-all flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            {view === 'sales' ? 'Print / PDF' : 'Print'}
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={view === 'sales' ? 'Sales Report' : 'Item Sales Report'}
        description={
          view === 'sales'
            ? 'Sales by department, category and item, with dayparts, payments, staff and controls'
            : 'Sales and quantities by category and product for a chosen day or date range'
        }
        action={filterControls}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {!isLoading && !hasSales && (
          <EmptyState
            icon={ReceiptTextIcon}
            title="No sales in this range"
            description="Pick a different day or date range to see the report."
          />
        )}

        {hasSales && view === 'items' && itemReport && <ItemSalesReportView report={itemReport} />}

        {hasSales && view === 'sales' && report && (
          <>
            <div className="hidden print:block mb-6 border-b-4 border-primary pb-3">
              <p className="text-xl font-bold">Sales Report</p>
              <p className="text-xs text-muted-foreground">
                {report.organizationName} · {formatDateTime(report.period.startDate)} – {formatDateTime(report.period.endDate)}
              </p>
            </div>
            <SalesReportView report={report} />
          </>
        )}
      </div>
    </div>
  )
}
