import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  FileText,
  Download,
  TableProperties,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Receipt,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Label, DatePicker, DropdownPanel } from '@/components/ui'
import { taxApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { TaxFilingPreview, TaxComplianceItem } from '@/types'
import { useOverscrollBounce } from '@/hooks'
import type { ReportPeriod } from '@/api/reports'

const currentYear = new Date().getFullYear()

function defaultStart() {
  return `${currentYear}-01-01`
}
function defaultEnd() {
  return `${currentYear}-12-31`
}

function getPeriodDates(period: ReportPeriod, customStart: string, customEnd: string) {
  if (period === 'CUSTOM') return { startDate: customStart, endDate: customEnd }
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  if (period === 'THIS_MONTH') return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(now) }
  if (period === 'LAST_MONTH') return { startDate: fmt(new Date(y, m - 1, 1)), endDate: fmt(new Date(y, m, 0)) }
  const q = Math.floor(m / 3)
  if (period === 'THIS_QUARTER') return { startDate: fmt(new Date(y, q * 3, 1)), endDate: fmt(now) }
  if (period === 'LAST_QUARTER') return { startDate: fmt(new Date(y, (q - 1) * 3, 1)), endDate: fmt(new Date(y, q * 3, 0)) }
  if (period === 'THIS_YEAR') return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(now) }
  if (period === 'LAST_YEAR') return { startDate: fmt(new Date(y - 1, 0, 1)), endDate: fmt(new Date(y - 1, 11, 31)) }
  return { startDate: '', endDate: '' }
}

function ComplianceIcon({ status }: { status: TaxComplianceItem['status'] }) {
  if (status === 'ok') return <CheckCircle className="h-5 w-5 text-green-600" />
  if (status === 'warn') return <AlertTriangle className="h-5 w-5 text-amber-500" />
  return <XCircle className="h-5 w-5 text-destructive" />
}

function SummaryRow({ label, value, highlight }: { label: string; value: number | string; highlight?: string }) {
  const isNeg = typeof value === 'number' && value < 0
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight ?? (isNeg ? 'text-destructive' : '')}`}>
        {typeof value === 'number' ? formatCurrency(value) : value}
      </span>
    </div>
  )
}

export function TaxFilingPackPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [period, setPeriod] = useState<ReportPeriod>('THIS_YEAR')
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false)
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'csv' | null>(null)

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

  const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
    { value: 'THIS_MONTH', label: 'This Month' },
    { value: 'LAST_MONTH', label: 'Last Month' },
    { value: 'THIS_QUARTER', label: 'This Quarter' },
    { value: 'LAST_QUARTER', label: 'Last Quarter' },
    { value: 'THIS_YEAR', label: 'This Year' },
    { value: 'LAST_YEAR', label: 'Last Year' },
    { value: 'CUSTOM', label: 'Custom Range' },
  ]

  const handlePeriodChange = (p: ReportPeriod) => {
    setPeriod(p)
    setSubmitted(false)
    if (p !== 'CUSTOM') {
      const dates = getPeriodDates(p, '', '')
      if (dates.startDate && dates.endDate) {
        setStartDate(dates.startDate)
        setEndDate(dates.endDate)
        
        if (p === 'THIS_YEAR') {
          setSelectedYear(currentYear)
        } else if (p === 'LAST_YEAR') {
          setSelectedYear(currentYear - 1)
        }
      }
    }
  }

  const { data: preview, isLoading, error } = useQuery<TaxFilingPreview>({
    queryKey: ['tax', 'preview', startDate, endDate],
    queryFn: () => taxApi.getFilingPackPreview(startDate, endDate),
    enabled: submitted,
  })

  async function handleDownload(type: 'pdf' | 'csv') {
    setIsDownloading(type)
    try {
      if (type === 'pdf') {
        const filename = `tari1-tax-summary-${startDate}-to-${endDate}.pdf`
        await taxApi.triggerDownload(
          `/tax/filing-pack/download/pdf-summary?startDate=${startDate}&endDate=${endDate}`,
          filename,
        )
      } else {
        const filename = `tari1-tax-data-${startDate}-to-${endDate}.csv`
        await taxApi.triggerDownload(
          `/tax/filing-pack/download/csv?startDate=${startDate}&endDate=${endDate}`,
          filename,
        )
      }
    } catch {
      toast.error('Download failed', { description: 'Please try again' })
    } finally {
      setIsDownloading(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Tax Filing Pack"
        description="Generate your annual tax summary for accountant review or FIRS submission"
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Period selector */}
        <Card className="mb-6">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-slate-700">
              <FileText className="h-5 w-5 text-slate-400" />
              Select Filing Period
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-end flex-wrap gap-4">
              
              {/* Period Selector */}
              <div className="space-y-1 relative w-full sm:w-auto">
                <Label>Filing Period</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2.5 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[160px] w-full sm:w-auto text-left"
                  >
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Calendar03Icon} size={16} color="currentColor" strokeWidth={1.5} className="text-slate-400" />
                      <span>{periodOptions.find((opt) => opt.value === period)?.label}</span>
                    </div>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", dropdownOpen && "rotate-180")} strokeWidth={1.5} />
                  </button>

                  <DropdownPanel
                    isOpen={dropdownOpen}
                    onClose={() => setDropdownOpen(false)}
                    align="left"
                    widthClass="w-full sm:w-48"
                    zIndexClass="z-20"
                  >
                    {periodOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          handlePeriodChange(opt.value)
                          setDropdownOpen(false)
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
              </div>

              {/* Year Selector */}
              <div className="space-y-1 relative w-full sm:w-auto">
                <Label>Filing Year</Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                    className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2.5 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px] w-full sm:w-auto text-left"
                  >
                    <span>{selectedYear}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", yearDropdownOpen && "rotate-180")} strokeWidth={1.5} />
                  </button>

                  <DropdownPanel
                    isOpen={yearDropdownOpen}
                    onClose={() => setYearDropdownOpen(false)}
                    align="left"
                    widthClass="w-full sm:w-32"
                    zIndexClass="z-20"
                  >
                    {years.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setSelectedYear(y)
                          setStartDate(`${y}-01-01`)
                          setEndDate(`${y}-12-31`)
                          setPeriod('CUSTOM')
                          setSubmitted(false)
                          setYearDropdownOpen(false)
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
                          selectedYear === y 
                            ? "bg-[#0037b0]/5 text-[#0037b0]" 
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </DropdownPanel>
                </div>
              </div>

              {/* Custom Date Pickers */}
              {period === 'CUSTOM' && (
                <>
                  <div className="space-y-1 w-full sm:w-auto">
                    <Label>Start Date</Label>
                    <DatePicker
                      value={startDate}
                      onChange={(val) => { setStartDate(val); setSubmitted(false) }}
                      className="w-full sm:w-36"
                    />
                  </div>
                  <div className="space-y-1 w-full sm:w-auto">
                    <Label>End Date</Label>
                    <DatePicker
                      value={endDate}
                      onChange={(val) => { setEndDate(val); setSubmitted(false) }}
                      className="w-full sm:w-36"
                    />
                  </div>
                </>
              )}

              {/* Generate Button */}
              <Button
                onClick={() => setSubmitted(true)}
                disabled={!startDate || !endDate}
                className="w-full sm:w-auto h-11 cursor-pointer"
              >
                Generate Preview
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {submitted && isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-destructive">
              Failed to generate preview. Please try again.
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-6">
            {/* Revenue */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <SummaryRow label="Total Revenue (paid invoices)" value={preview.revenue.totalRevenue} highlight="text-green-600 font-semibold" />
                <SummaryRow label="Total Collected" value={preview.revenue.totalCollected} />
                <SummaryRow label="Outstanding (unpaid)" value={preview.revenue.totalOutstanding} highlight="text-amber-600" />
                <SummaryRow label="VAT Collected on Paid Invoices" value={preview.revenue.vatCollected} />
                <div className="py-2 text-xs text-muted-foreground">
                  {preview.revenue.paidInvoiceCount} paid invoices out of {preview.revenue.invoiceCount} total
                </div>
              </CardContent>
            </Card>

            {/* Deductible Expenses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Deductible Expenses</span>
                  <button
                    type="button"
                    onClick={() => setShowExpenseBreakdown((v) => !v)}
                    className="flex items-center gap-1 text-sm font-normal text-primary hover:underline"
                  >
                    {showExpenseBreakdown ? 'Hide' : 'Show'} breakdown
                    {showExpenseBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {showExpenseBreakdown && preview.expenses.deductible.byCategory.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between py-2 pl-4">
                    <span className="text-sm text-muted-foreground">
                      {cat.label} <span className="text-xs">({cat.count})</span>
                    </span>
                    <span className="text-sm font-medium">{formatCurrency(cat.total)}</span>
                  </div>
                ))}
                <SummaryRow
                  label="Total Deductible Expenses"
                  value={preview.expenses.deductible.total}
                  highlight="font-semibold"
                />
                {preview.expenses.nonDeductible.count > 0 && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">
                      Non-Deductible Expenses ({preview.expenses.nonDeductible.count}) — excluded
                    </span>
                    <span className="text-sm text-destructive font-medium">
                      {formatCurrency(preview.expenses.nonDeductible.total)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tax Calculation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tax Calculation</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <SummaryRow label="Taxable Profit (Revenue – Deductible Expenses)" value={preview.tax.taxableProfit} />
                <div className="py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CIT Status</p>
                  <p className="mt-1 text-sm font-medium text-green-700 dark:text-green-400">{preview.tax.citStatus}</p>
                </div>
                <div className="pt-2">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">VAT</p>
                  <SummaryRow label="VAT Collected" value={preview.tax.vatCollected} />
                  <SummaryRow label="VAT Paid on Expenses (approx.)" value={preview.tax.vatPaidOnExpenses} />
                  <div className="mt-1 border-t pt-2">
                    <SummaryRow
                      label="Net VAT Liability"
                      value={preview.tax.netVatLiability}
                      highlight={preview.tax.netVatLiability >= 0 ? 'text-primary font-semibold' : 'text-green-600 font-semibold'}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compliance Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compliance Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {preview.compliance.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <ComplianceIcon status={item.status} />
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.status !== 'ok' && (
                          <p className="text-xs text-muted-foreground">{item.hint}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Download */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-5 w-5" />
                  Download Filing Pack
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Download these documents to share with your accountant or submit to the FIRS.
                  Each download is logged for your audit trail.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleDownload('pdf')}
                    isLoading={isDownloading === 'pdf'}
                    disabled={!!isDownloading}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    PDF Summary
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDownload('csv')}
                    isLoading={isDownloading === 'csv'}
                    disabled={!!isDownloading}
                    className="flex items-center gap-2"
                  >
                    <TableProperties className="h-4 w-4" />
                    Excel Export (CSV)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open('/expenses?isDeductible=true', '_blank')}
                    className="flex items-center gap-2"
                  >
                    <Receipt className="h-4 w-4" />
                    View Deductible Expenses
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
