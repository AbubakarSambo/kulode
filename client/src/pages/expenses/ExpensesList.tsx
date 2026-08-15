import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { posthog } from '@/lib/posthog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  PencilEdit02Icon,
  Delete02Icon,
  TagsIcon,
  Search01Icon,
  ArrowDown01Icon,
  MoreVerticalIcon,
  WalletRemove01Icon,
  FilterHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Input, ConfirmDialog, EmptyState, DropdownPanel, DatePicker } from '@/components/ui'
import { BottomSheet } from '@/components/shared'
import { expensesApi } from '@/api'
import { type ReportPeriod } from '@/api/reports'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { TAX_CATEGORY_LABELS, type TaxCategory } from '@/types'
import { useSubscription } from '@/hooks/useSubscription'

import { ExpensesIcon } from '@/components/ui/CustomIcons'
import { useOverscrollBounce } from '@/hooks'

const methodDotColors: Record<string, string> = {
  BANK_TRANSFER: 'bg-blue-500',
  PAYSTACK: 'bg-indigo-500',
  CARD: 'bg-emerald-500',
  CASH: 'bg-slate-400',
  OTHER: 'bg-slate-300',
}

const methodTextColors: Record<string, string> = {
  BANK_TRANSFER: 'text-blue-700',
  PAYSTACK: 'text-indigo-700',
  CARD: 'text-emerald-700',
  CASH: 'text-slate-600',
  OTHER: 'text-slate-500',
}

const formatPaymentMethod = (method: string) => {
  if (!method) return ''
  return method
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const formatPeriodLabel = (period: ReportPeriod) => {
  switch (period) {
    case 'THIS_MONTH': return 'This Month'
    case 'LAST_MONTH': return 'Last Month'
    case 'THIS_QUARTER': return 'This Quarter'
    case 'LAST_QUARTER': return 'Last Quarter'
    case 'THIS_YEAR': return 'This Year'
    case 'LAST_YEAR': return 'Last Year'
    case 'CUSTOM': return 'Custom'
  }
}

function getPeriodDates(period: ReportPeriod, customStart: string, customEnd: string) {
  if (period === 'CUSTOM') return { startDate: customStart || undefined, endDate: customEnd || undefined }
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
  return {}
}

const getInitials = (name: string) => {
  if (!name) return '??'
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ExpensesListPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState<{ id: string; description: string } | null>(null)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [isDeductible, setIsDeductible] = useState<boolean | undefined>(undefined)
  
  // Custom filter state variables
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [taxCategory, setTaxCategory] = useState<string | undefined>(undefined)
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<'category' | 'taxCategory' | 'taxStatus' | null>(null)
  
  // Mobile sheet states
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [tempCategoryId, setTempCategoryId] = useState<string | undefined>(undefined)
  const [tempTaxCategory, setTempTaxCategory] = useState<string | undefined>(undefined)
  const [tempIsDeductible, setTempIsDeductible] = useState<boolean | undefined>(undefined)

  const openMobileFilters = () => {
    setTempCategoryId(categoryId)
    setTempTaxCategory(taxCategory)
    setTempIsDeductible(isDeductible)
    setIsMobileFiltersOpen(true)
  }

  const closeMobileFilters = () => {
    setIsMobileFiltersOpen(false)
  }

  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = !!user?.roles.includes('SUPER_ADMIN')
  const queryClient = useQueryClient()
  const { isReadOnlyMode: isExpired } = useSubscription()
  const showActions = isSuperAdmin && !isExpired

  const { startDate: filterStart, endDate: filterEnd } = getPeriodDates(period, startDate, endDate)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: (_, id) => {
      posthog.capture('expense_deleted', { expense_id: id })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete expense')
    },
  })

  const handleDeleteTrigger = (expenseId: string, description: string) => {
    setExpenseToDelete({ id: expenseId, description })
    setDeleteConfirmOpen(true)
  }

  // Fetch categories for filtering
  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expensesApi.listCategories(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { page, limit, period, filterStart, filterEnd, isDeductible, categoryId, taxCategory }],
    queryFn: () => expensesApi.list({ 
      page, 
      limit, 
      startDate: filterStart, 
      endDate: filterEnd, 
      isDeductible, 
      categoryId, 
      taxCategory: taxCategory as TaxCategory
    }),
  })

  const expenses = data?.data ?? []
  const filteredExpenses = expenses.filter(exp => 
    exp.description.toLowerCase().includes(search.toLowerCase()) ||
    (exp.recipient && exp.recipient.toLowerCase().includes(search.toLowerCase())) ||
    (exp.category?.name && exp.category.name.toLowerCase().includes(search.toLowerCase()))
  )

  const activeFiltersCount = [
    categoryId !== undefined,
    taxCategory !== undefined,
    isDeductible !== undefined,
  ].filter(Boolean).length

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative min-h-0">
      <Header
        title="Expenses"
        description="Track your business expenses"
        icon={ExpensesIcon}
        category="Accounting"
        badgeText={data?.meta.total}
        action={
          <div className="flex items-center gap-2">
            {/* Custom Premium Period Dropdown */}
            <div className="relative inline-block text-left">
              <button
                onClick={() => setPeriodOpen(!periodOpen)}
                className="h-10 px-4 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[140px] cursor-pointer"
              >
                <span>{formatPeriodLabel(period)}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200", periodOpen && "rotate-180")} strokeWidth={1.5} />
              </button>

              <DropdownPanel
                isOpen={periodOpen}
                onClose={() => setPeriodOpen(false)}
                align="right"
                widthClass="w-48"
              >
                {(['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'CUSTOM'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPeriod(p)
                      setPage(1)
                      setPeriodOpen(false)
                    }}
                    className={cn(
                      "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                      period === p 
                        ? "bg-[#0037b0]/5 text-[#0037b0]" 
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {formatPeriodLabel(p)}
                  </button>
                ))}
              </DropdownPanel>
            </div>

            {period === 'CUSTOM' && (
              <>
                <DatePicker
                  value={startDate}
                  onChange={(val) => { setStartDate(val); setPage(1) }}
                  className="w-36"
                />
                <DatePicker
                  value={endDate}
                  onChange={(val) => { setEndDate(val); setPage(1) }}
                  className="w-36"
                />
              </>
            )}
            {!isExpired && (
              <>
                <Link to="/expenses/bulk-recategorize">
                  <Button variant="outline" className="h-10">
                    <HugeiconsIcon icon={TagsIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Bulk Recategorize
                  </Button>
                </Link>
                <Link to="/expenses/new">
                  <Button className="h-10">
                    <HugeiconsIcon icon={PlusSignIcon} className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Add Expense
                  </Button>
                </Link>
              </>
            )}
          </div>
        }
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="pt-4 sm:pt-6">
        {/* Mobile Sticky Period Selector */}
        <div className="sticky top-0 z-20 bg-background py-3 px-4 -mx-4 border-b border-[#eef4ff]/30 sm:hidden flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Period:</span>
            <Link to="/expenses/bulk-recategorize" className="text-xs font-bold text-[#0037b0] hover:underline flex items-center">
              <HugeiconsIcon icon={TagsIcon} className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} /> Bulk Recategorize
            </Link>
          </div>
          
          <div className="relative w-full">
            <button
              onClick={() => setPeriodOpen(!periodOpen)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <span>{formatPeriodLabel(period)}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-450 transition-transform duration-200", periodOpen && "rotate-180")} strokeWidth={1.5} />
            </button>

            <DropdownPanel
              isOpen={periodOpen}
              onClose={() => setPeriodOpen(false)}
              align="left"
              widthClass="w-full"
            >
              {(['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR', 'LAST_YEAR', 'CUSTOM'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p)
                    setPage(1)
                    setPeriodOpen(false)
                  }}
                  className={cn(
                    "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                    period === p 
                      ? "bg-[#0037b0]/5 text-[#0037b0]" 
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {formatPeriodLabel(p)}
                </button>
              ))}
            </DropdownPanel>
          </div>

          {period === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <DatePicker
                value={startDate}
                onChange={(val) => { setStartDate(val); setPage(1) }}
                className="w-full"
              />
              <DatePicker
                value={endDate}
                onChange={(val) => { setEndDate(val); setPage(1) }}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Search and Filters Layout */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Desktop Filters Bar (hidden on mobile) */}
          <div className="hidden md:flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="relative flex-1 max-w-[240px]">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
                <Input
                  placeholder="Search expenses..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-11 rounded-xl h-10 bg-white"
                />
              </div>

              {/* Custom Category Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'category' ? null : 'category')}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[150px] cursor-pointer",
                    categoryId ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {categoryId ? (categoriesData?.find(c => c.id === categoryId)?.name ?? 'Category') : 'All Categories'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", filterDropdownOpen === 'category' && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={filterDropdownOpen === 'category'}
                  onClose={() => setFilterDropdownOpen(null)}
                  align="left"
                  widthClass="w-56"
                  className="max-h-60 overflow-y-auto"
                >
                  <button
                    onClick={() => {
                      setCategoryId(undefined)
                      setPage(1)
                      setFilterDropdownOpen(null)
                    }}
                    className={cn(
                      "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                      !categoryId ? "bg-[#0037b0]/5 text-[#0037b0]" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    All Categories
                  </button>
                  {categoriesData?.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setCategoryId(cat.id)
                        setPage(1)
                        setFilterDropdownOpen(null)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        categoryId === cat.id ? "bg-[#0037b0]/5 text-[#0037b0]" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </DropdownPanel>
              </div>

              {/* Custom Tax Category Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'taxCategory' ? null : 'taxCategory')}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[165px] cursor-pointer",
                    taxCategory ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {taxCategory ? (TAX_CATEGORY_LABELS[taxCategory as TaxCategory] ?? 'Tax Category') : 'All Tax Categories'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", filterDropdownOpen === 'taxCategory' && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={filterDropdownOpen === 'taxCategory'}
                  onClose={() => setFilterDropdownOpen(null)}
                  align="left"
                  widthClass="w-64"
                  className="max-h-60 overflow-y-auto"
                >
                  <button
                    onClick={() => {
                      setTaxCategory(undefined)
                      setPage(1)
                      setFilterDropdownOpen(null)
                    }}
                    className={cn(
                      "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                      !taxCategory ? "bg-[#0037b0]/5 text-[#0037b0]" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    All Tax Categories
                  </button>
                  {(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTaxCategory(key)
                        setPage(1)
                        setFilterDropdownOpen(null)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        taxCategory === key ? "bg-[#0037b0]/5 text-[#0037b0]" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {TAX_CATEGORY_LABELS[key]}
                    </button>
                  ))}
                </DropdownPanel>
              </div>

              {/* Custom Tax Status Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'taxStatus' ? null : 'taxStatus')}
                  className={cn(
                    "h-10 px-4 rounded-xl border bg-white text-xs font-semibold hover:bg-slate-50 transition-all flex items-center justify-between gap-2 min-w-[145px] cursor-pointer",
                    isDeductible !== undefined ? "border-[#0037b0]/35 text-[#0037b0] bg-[#0037b0]/04" : "border-border text-slate-700"
                  )}
                >
                  <span className="truncate">
                    {isDeductible === true ? 'Deductible' : isDeductible === false ? 'Non-Deductible' : 'All Tax Statuses'}
                  </span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", filterDropdownOpen === 'taxStatus' && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={filterDropdownOpen === 'taxStatus'}
                  onClose={() => setFilterDropdownOpen(null)}
                  align="left"
                  widthClass="w-48"
                >
                  {([
                    { label: 'All Tax Statuses', value: undefined },
                    { label: 'Deductible', value: true },
                    { label: 'Non-Deductible', value: false }
                  ] as const).map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setIsDeductible(opt.value)
                        setPage(1)
                        setFilterDropdownOpen(null)
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        isDeductible === opt.value ? "bg-[#0037b0]/5 text-[#0037b0]" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </DropdownPanel>
              </div>

              {/* Reset Filters button */}
              {(categoryId !== undefined || taxCategory !== undefined || isDeductible !== undefined) && (
                <button
                  onClick={() => {
                    setCategoryId(undefined)
                    setTaxCategory(undefined)
                    setIsDeductible(undefined)
                    setPage(1)
                  }}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline transition-all py-2 px-1 cursor-pointer shrink-0"
                >
                  Reset Filters
                </button>
              )}
            </div>

            {/* Total summary info on desktop */}
            {data && (
              <div className="bg-[#eef4ff]/30 border border-[#0037b0]/8 rounded-2xl py-2 px-4 flex items-center justify-between gap-6 shadow-sm shrink-0 select-none">
                <div>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Period Expenses</p>
                  <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                    -{formatCurrency(data.meta.totalAmount ?? 0)}
                  </p>
                </div>
                <div className="text-right border-l border-[#0037b0]/8 pl-5">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Total Count</p>
                  <p className="text-xs font-bold text-slate-800 tabular-nums mt-0.5">{data.meta.total} items</p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Search and Filter trigger row (hidden on desktop) */}
          <div className="flex md:hidden flex-row items-center gap-2 w-full">
            <div className="relative flex-1">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
              <Input
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-11 rounded-xl h-11 bg-white w-full border-border focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <button
              onClick={openMobileFilters}
              className={cn(
                "h-11 w-11 rounded-xl border flex items-center justify-center relative hover:bg-slate-50 transition-all shrink-0 cursor-pointer",
                activeFiltersCount > 0 
                  ? "border-[#0037b0] text-[#0037b0] bg-[#0037b0]/04" 
                  : "border-border bg-white text-slate-750"
              )}
              aria-label="Filters"
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} className="h-5 w-5" strokeWidth={1.5} />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-[#0037b0] text-[10px] font-black text-white leading-none border border-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Mobile aggregate display */}
          {data && (
            <div className="flex md:hidden bg-[#eef4ff]/30 border border-[#0037b0]/8 rounded-2xl py-2 px-4 items-center justify-between gap-6 shadow-sm shrink-0 select-none">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Period Expenses</p>
                <p className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                  -{formatCurrency(data.meta.totalAmount ?? 0)}
                </p>
              </div>
              <div className="text-right border-l border-[#0037b0]/8 pl-5">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Total Count</p>
                <p className="text-xs font-bold text-slate-800 tabular-nums mt-0.5">{data.meta.total} items</p>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={WalletRemove01Icon}
            title={search ? "No expenses found" : "No expenses recorded"}
            description={search ? "Try adjusting your search terms or period filters." : "Track your outgoing business cash flows and tax-deductible items."}
            actionLabel={isExpired ? undefined : "Add your first expense"}
            actionHref={isExpired ? undefined : "/expenses/new"}
          />
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
              <CardContent className="p-0">
                <div className="overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-600">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Description</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Category</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Tax Category</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Method</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                        {showActions && <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {filteredExpenses.map((expense, index) => (
                        <tr 
                          key={expense.id} 
                          className={cn(
                            "transition-all duration-150 hover:bg-[#eef4ff]/20",
                            index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08"
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-[11px] font-semibold shrink-0 select-none">
                                {getInitials(expense.recipient || expense.description)}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 text-sm">{expense.description}</p>
                                {expense.recipient && (
                                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{expense.recipient}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="secondary" className="rounded-md font-semibold text-xs py-0.5">
                              {expense.category?.name ?? 'Uncategorized'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {expense.taxCategory && expense.taxCategory !== 'UNCATEGORIZED' ? (
                              <span className={cn(
                                "inline-flex items-center rounded-xl px-2.5 py-0.5 text-xs font-semibold border",
                                expense.isDeductible 
                                  ? "bg-emerald-50/80 text-emerald-700 border-emerald-100/40" 
                                  : "bg-rose-50/80 text-rose-700 border-rose-100/40"
                              )}>
                                {TAX_CATEGORY_LABELS[expense.taxCategory]
                                  .split(' ')
                                  .map(w => w === '&' ? '&' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                                  .join(' ')
                                }
                              </span>
                            ) : (
                              <span className="text-xs text-slate-350">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                            {formatDate(expense.expenseDate)}
                          </td>
                          <td className="px-6 py-4 text-left">
                            <div className="flex items-center gap-2 select-none justify-start">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                methodDotColors[expense.paymentMethod] || methodDotColors.OTHER
                              )} />
                              <span className={cn(
                                "text-xs font-semibold tracking-wide",
                                methodTextColors[expense.paymentMethod] || methodTextColors.OTHER
                              )}>
                                {formatPaymentMethod(expense.paymentMethod)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-800 tabular-nums text-sm">
                            -{formatCurrency(expense.amount)}
                          </td>
                          {showActions && (
                            <td className="px-6 py-4 text-right relative">
                              <div className="inline-block text-left relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdown(activeDropdown === expense.id ? null : expense.id);
                                  }}
                                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer animate-in duration-200"
                                >
                                  <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
                                </button>
                                
                                <DropdownPanel
                                  isOpen={activeDropdown === expense.id}
                                  onClose={() => setActiveDropdown(null)}
                                  align="right"
                                  widthClass="w-36"
                                  zIndexClass="z-20"
                                >
                                  <Link
                                    to={`/expenses/${expense.id}/edit`}
                                    onClick={() => setActiveDropdown(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
                                  >
                                    <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="text-slate-400" strokeWidth={1.5} />
                                    Edit Expense
                                  </Link>
                                  <button
                                    onClick={() => {
                                      setActiveDropdown(null);
                                      handleDeleteTrigger(expense.id, expense.description);
                                    }}
                                    disabled={deleteMutation.isPending}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer rounded-lg"
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} size={14} className="text-rose-500" strokeWidth={1.5} />
                                    Delete Expense
                                  </button>
                                </DropdownPanel>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Card-Based List View */}
            <div className="flex flex-col gap-4 md:hidden">
              {filteredExpenses.map((expense) => (
                <div 
                  key={expense.id}
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.08)] border-0 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.12)] relative"
                >
                  {/* Top row: Avatar + details on left, circular action buttons on right */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0037b0]/5 text-[#0037b0] border border-[#0037b0]/8 flex items-center justify-center text-xs font-semibold shrink-0 select-none">
                        {getInitials(expense.recipient || expense.description)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{expense.description}</p>
                        {expense.recipient && (
                          <span className="text-xs text-slate-500 font-semibold block mt-0.5">{expense.recipient}</span>
                        )}
                      </div>
                    </div>
                    {showActions && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Link 
                          to={`/expenses/${expense.id}/edit`}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shadow-sm cursor-pointer shrink-0"
                          aria-label="Edit"
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.5} />
                        </Link>
                        <button
                          onClick={() => handleDeleteTrigger(expense.id, expense.description)}
                          disabled={deleteMutation.isPending}
                          className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-100 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer shadow-sm shrink-0"
                          aria-label="Delete"
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Middle row: Category and Tax Category pills styled with soft casing/colors */}
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider rounded-md py-0.5">
                      {expense.category?.name ?? 'Uncategorized'}
                    </Badge>
                    {expense.taxCategory && expense.taxCategory !== 'UNCATEGORIZED' && (
                      <span className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                        expense.isDeductible 
                          ? "bg-emerald-50/80 text-emerald-700 border-emerald-100/45" 
                          : "bg-rose-50/80 text-rose-700 border-rose-100/45"
                      )}>
                        {TAX_CATEGORY_LABELS[expense.taxCategory]
                          .split(' ')
                          .map(w => w === '&' ? '&' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                          .join(' ')
                        }
                      </span>
                    )}
                  </div>

                  {/* Bottom row: Date & Method on left, Amount on right */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#eef4ff]/50">
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium select-none">
                      <span>{formatDate(expense.expenseDate)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          methodDotColors[expense.paymentMethod] || methodDotColors.OTHER
                        )} />
                        <span>{formatPaymentMethod(expense.paymentMethod)}</span>
                      </div>
                    </div>
                    
                    <span className="text-sm font-extrabold text-[#ba1a1a] shrink-0 tabular-nums">
                      -{formatCurrency(expense.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination & Limit Selector */}
        {data && data.meta.total > 0 && (
          <div className="hidden md:flex mt-6 flex-row items-center justify-between gap-4 border-t border-[#eef4ff]/50 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Show:</span>
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setLimitOpen(!limitOpen)}
                  className="h-9 px-3.5 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px]"
                >
                  <span>{limit} per page</span>
                  <HugeiconsIcon icon={ArrowDown01Icon} className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", limitOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                <DropdownPanel
                  isOpen={limitOpen}
                  onClose={() => setLimitOpen(false)}
                  align="left"
                  widthClass="w-full min-w-[120px]"
                  zIndexClass="z-20"
                  animateDirection="bottom"
                  className="bottom-11"
                >
                  {([10, 25, 50, 100] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        setLimit(val);
                        setPage(1);
                        setLimitOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                        limit === val 
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
            
            {data.meta.totalPages >= 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 rounded-lg text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500 font-medium">
                  Page {page} of {data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="h-8 rounded-lg text-xs"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Mobile Load More Button */}
        {data && data.meta.total > limit && (
          <div className="mt-6 md:hidden flex justify-center">
            <Button
              onClick={() => setLimit((prev) => prev + 10)}
              variant="outline"
              className="w-full py-4 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all min-h-[44px]"
            >
              Load More Expenses ({data.meta.total - limit} remaining)
            </Button>
          </div>
        )}
      </div>      {/* Mobile Floating Action Button */}
      {!isExpired && (
        <Link 
          to="/expenses/new" 
          className="absolute bottom-6 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
          aria-label="Add Expense"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={24} strokeWidth={1.5} />
        </Link>
      )}

      {/* Mobile slide-up bottom sheet for filters */}
      <BottomSheet
        isOpen={isMobileFiltersOpen}
        onClose={closeMobileFilters}
        title="Filter Expenses"
        onClearAll={() => {
          setTempCategoryId(undefined)
          setTempTaxCategory(undefined)
          setTempIsDeductible(undefined)
        }}
      >
        {/* Scrollable Filters list */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-6 select-none text-left">
          {/* Tax Status Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Tax Status</h4>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'All', value: undefined },
                { label: 'Deductible', value: true },
                { label: 'Non-Deductible', value: false }
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTempIsDeductible(opt.value)}
                  className={cn(
                    "py-2 px-3 rounded-full text-xs font-semibold transition-all text-center cursor-pointer border-0",
                    tempIsDeductible === opt.value
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-650 hover:bg-slate-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Category</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTempCategoryId(undefined)}
                className={cn(
                  "py-2 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer border-0",
                  tempCategoryId === undefined
                    ? "bg-[#0037b0] text-white shadow-sm font-bold"
                    : "bg-slate-100 text-slate-650 hover:bg-slate-200"
                )}
              >
                All Categories
              </button>
              {categoriesData?.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTempCategoryId(cat.id)}
                  className={cn(
                    "py-2 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer border-0",
                    tempCategoryId === cat.id
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-650 hover:bg-slate-200"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tax Category Section */}
          <div className="bg-[#eef4ff]/35 rounded-2xl p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-[#0037b0]/60 mb-3">Tax Category</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTempTaxCategory(undefined)}
                className={cn(
                  "py-2 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer border-0",
                  tempTaxCategory === undefined
                    ? "bg-[#0037b0] text-white shadow-sm font-bold"
                    : "bg-slate-100 text-slate-650 hover:bg-slate-200"
                )}
              >
                All Tax Categories
              </button>
              {(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTempTaxCategory(key)}
                  className={cn(
                    "py-2 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer border-0",
                    tempTaxCategory === key
                      ? "bg-[#0037b0] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-650 hover:bg-slate-200"
                  )}
                >
                  {TAX_CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#eef4ff]/50 shrink-0">
          <Button
            variant="outline"
            type="button"
            onClick={closeMobileFilters}
            className="py-3 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all min-h-[44px] border-0 shadow-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCategoryId(tempCategoryId)
              setTaxCategory(tempTaxCategory)
              setIsDeductible(tempIsDeductible)
              setPage(1)
              closeMobileFilters()
            }}
            className="py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] hover:opacity-95 transition-all min-h-[44px] border-0"
          >
            Apply Filters
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setExpenseToDelete(null)
        }}
        onConfirm={() => {
          if (expenseToDelete) {
            deleteMutation.mutate(expenseToDelete.id, {
              onSuccess: () => {
                setDeleteConfirmOpen(false)
                setExpenseToDelete(null)
              }
            })
          }
        }}
        title="Delete Expense"
        description={`Are you sure you want to delete the expense "${expenseToDelete?.description}"? This action cannot be undone and will permanently remove the record.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isLoading={deleteMutation.isPending}
      />
        </div>
      </div>
    )
  }
