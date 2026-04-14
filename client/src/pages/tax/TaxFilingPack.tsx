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
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui'
import { taxApi } from '@/api'
import { formatCurrency } from '@/lib/utils'
import type { TaxFilingPreview, TaxComplianceItem } from '@/types'

const currentYear = new Date().getFullYear()

function defaultStart() {
  return `${currentYear}-01-01`
}
function defaultEnd() {
  return `${currentYear}-12-31`
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
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [submitted, setSubmitted] = useState(false)
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false)
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'csv' | null>(null)

  const { data: preview, isLoading, error } = useQuery<TaxFilingPreview>({
    queryKey: ['tax', 'preview', startDate, endDate],
    queryFn: () => taxApi.getFilingPackPreview(startDate, endDate),
    enabled: submitted,
  })

  async function handleDownload(type: 'pdf' | 'csv') {
    setIsDownloading(type)
    try {
      if (type === 'pdf') {
        const filename = `kulode-tax-summary-${startDate}-to-${endDate}.pdf`
        await taxApi.triggerDownload(
          `/tax/filing-pack/download/pdf-summary?startDate=${startDate}&endDate=${endDate}`,
          filename,
        )
      } else {
        const filename = `kulode-tax-data-${startDate}-to-${endDate}.csv`
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

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Period selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Select Filing Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setSubmitted(false) }}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setSubmitted(false) }}
                  className="w-40"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => { setStartDate(`${currentYear}-01-01`); setEndDate(`${currentYear}-12-31`); setSubmitted(false) }}
                  variant="outline"
                  size="sm"
                >
                  {currentYear}
                </Button>
                <Button
                  onClick={() => { setStartDate(`${currentYear - 1}-01-01`); setEndDate(`${currentYear - 1}-12-31`); setSubmitted(false) }}
                  variant="outline"
                  size="sm"
                >
                  {currentYear - 1}
                </Button>
              </div>
              <Button
                onClick={() => setSubmitted(true)}
                disabled={!startDate || !endDate}
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
