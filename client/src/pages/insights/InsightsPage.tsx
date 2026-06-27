import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, Lightbulb, ChevronDown, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, DropdownPanel } from '@/components/ui'
import { aiApi, type Insight } from '@/api/ai'
import { type ReportPeriod } from '@/api/reports'
import { InsightsIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'
import { cn } from '@/lib/utils'

const PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: 'This Month', value: 'THIS_MONTH' },
  { label: 'Last Month', value: 'LAST_MONTH' },
  { label: 'This Quarter', value: 'THIS_QUARTER' },
  { label: 'Last Quarter', value: 'LAST_QUARTER' },
  { label: 'This Year', value: 'THIS_YEAR' },
  { label: 'Last Year', value: 'LAST_YEAR' },
]

const sentimentConfig = {
  positive: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    Icon: TrendingUp,
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    Icon: TrendingDown,
  },
  neutral: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-50',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    badge: 'bg-slate-100 text-slate-600',
    Icon: Minus,
  },
}

const categoryLabel: Record<Insight['category'], string> = {
  revenue: 'Revenue',
  expenses: 'Expenses',
  clients: 'Clients',
  collections: 'Collections',
  products: 'Products',
}

function InsightCard({ insight }: { insight: Insight }) {
  const config = sentimentConfig[insight.sentiment]
  const { Icon } = config
  return (
    <div className={cn(
      'rounded-[20px] border-l-4 p-5 shadow-[0px_4px_16px_rgba(0,55,176,0.06)] bg-white',
      config.border,
    )}>
      <div className="flex items-start gap-3 mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', config.iconBg)}>
          <Icon className={cn('w-4 h-4', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full', config.badge)}>
              {categoryLabel[insight.category]}
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 leading-snug">{insight.title}</h3>
        </div>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed mb-3">{insight.body}</p>
      <div className="flex items-start gap-2 pt-3 border-t border-slate-100">
        <Lightbulb className="w-3.5 h-3.5 text-[#0037b0] shrink-0 mt-0.5" />
        <p className="text-xs text-[#0037b0] font-medium leading-relaxed">{insight.recommendation}</p>
      </div>
    </div>
  )
}

function InsightSkeleton() {
  return (
    <div className="rounded-[20px] border-l-4 border-l-slate-200 p-5 bg-white shadow-[0px_4px_16px_rgba(0,55,176,0.06)] animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1">
          <div className="h-4 bg-slate-100 rounded w-20 mb-2" />
          <div className="h-4 bg-slate-100 rounded w-3/4" />
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="h-3 bg-slate-100 rounded w-4/5" />
      </div>
      <div className="pt-3 border-t border-slate-100">
        <div className="h-3 bg-slate-100 rounded w-2/3" />
      </div>
    </div>
  )
}

export function InsightsPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ai', 'insights', period],
    queryFn: () => aiApi.getInsights({ period }),
    staleTime: 5 * 60 * 1000,
  })

  const selectedLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? 'This Month'
  const loading = isLoading || isFetching

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header
        title="AI Insights"
        description="AI-powered analysis of your business performance"
        icon={InsightsIcon}
        category="Analytics"
        action={
          <div className="flex items-center gap-2">
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="h-10 px-4 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 min-w-[140px] cursor-pointer"
              >
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0', dropdownOpen && 'rotate-180')} />
              </button>
              <DropdownPanel
                isOpen={dropdownOpen}
                onClose={() => setDropdownOpen(false)}
                align="right"
                widthClass="w-48"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setPeriod(opt.value); setDropdownOpen(false) }}
                    className={cn(
                      'w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer',
                      period === opt.value ? 'bg-[#0037b0]/5 text-[#0037b0]' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </DropdownPanel>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading}
              className="h-10 w-10 rounded-xl border border-border bg-white flex items-center justify-center hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh insights"
            >
              <RefreshCw className={cn('h-4 w-4 text-slate-500', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-background px-4 pb-4 pt-0 sm:px-8 sm:pb-8">
        <div className="pt-4 sm:pt-8 max-w-4xl mx-auto">

          {/* Executive Summary */}
          {loading ? (
            <div className="mb-6 rounded-[24px] bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] p-6 animate-pulse">
              <div className="h-4 bg-white/20 rounded w-48 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-white/20 rounded w-full" />
                <div className="h-3 bg-white/20 rounded w-5/6" />
                <div className="h-3 bg-white/20 rounded w-4/5" />
              </div>
            </div>
          ) : data ? (
            <Card className="mb-6 border-0 bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] rounded-[24px] shadow-[0px_12px_32px_rgba(0,55,176,0.2)]">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <InsightsIcon className="text-white/80 w-5 h-5" />
                  <span className="text-white/80 text-xs font-bold uppercase tracking-widest">Business Summary</span>
                </div>
                <p className="text-white text-sm leading-relaxed font-medium">{data.summary}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Insight Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <InsightSkeleton key={i} />)}
            </div>
          ) : data?.insights && data.insights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.insights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#0037b0]/5 flex items-center justify-center mb-4">
                <InsightsIcon className="text-[#0037b0]/40 w-8 h-8" />
              </div>
              <p className="text-slate-500 text-sm">No insights available for this period</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
