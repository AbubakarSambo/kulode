import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Tags, Search, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Select, Input } from '@/components/ui'
import { expensesApi } from '@/api'
import { type ReportPeriod } from '@/api/reports'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { TAX_CATEGORY_LABELS } from '@/types'
import { ExpensesIcon } from '@/components/ui/CustomIcons'

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
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [limitOpen, setLimitOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const queryClient = useQueryClient()

  const { startDate: filterStart, endDate: filterEnd } = getPeriodDates(period, startDate, endDate)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete expense')
    },
  })

  const handleDelete = (expenseId: string) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      deleteMutation.mutate(expenseId)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { page, limit, period, filterStart, filterEnd }],
    queryFn: () => expensesApi.list({ page, limit, startDate: filterStart, endDate: filterEnd }),
  })

  const expenses = data?.data ?? []
  const filteredExpenses = expenses.filter(exp => 
    exp.description.toLowerCase().includes(search.toLowerCase()) ||
    (exp.recipient && exp.recipient.toLowerCase().includes(search.toLowerCase())) ||
    (exp.category?.name && exp.category.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Expenses"
        description="Track your business expenses"
        icon={ExpensesIcon}
        category="Accounting"
        badgeText={data?.meta.total}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={period}
              onChange={(e) => { setPeriod(e.target.value as ReportPeriod); setPage(1) }}
              className="w-40 h-10 rounded-xl"
            >
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_MONTH">Last Month</option>
              <option value="THIS_QUARTER">This Quarter</option>
              <option value="LAST_QUARTER">Last Quarter</option>
              <option value="THIS_YEAR">This Year</option>
              <option value="LAST_YEAR">Last Year</option>
              <option value="CUSTOM">Custom</option>
            </Select>
            {period === 'CUSTOM' && (
              <>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                  className="w-36 rounded-xl h-10"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="w-36 rounded-xl h-10"
                />
              </>
            )}
            <Link to="/expenses/bulk-recategorize">
              <Button variant="outline" className="h-10">
                <Tags className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Bulk Recategorize
              </Button>
            </Link>
            <Link to="/expenses/new">
              <Button className="h-10">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Add Expense
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Mobile Sticky Period Selector */}
        <div className="sticky top-0 z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 px-4 -mx-4 border-b border-[#eef4ff]/30 sm:hidden flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Period:</span>
            <Link to="/expenses/bulk-recategorize" className="text-xs font-bold text-[#0037b0] hover:underline flex items-center">
              <Tags className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} /> Bulk Recategorize
            </Link>
          </div>
          <Select
            value={period}
            onChange={(e) => { setPeriod(e.target.value as ReportPeriod); setPage(1) }}
            className="w-full bg-white h-9 rounded-lg text-xs"
          >
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_MONTH">Last Month</option>
            <option value="THIS_QUARTER">This Quarter</option>
            <option value="LAST_QUARTER">Last Quarter</option>
            <option value="THIS_YEAR">This Year</option>
            <option value="LAST_YEAR">Last Year</option>
            <option value="CUSTOM">Custom</option>
          </Select>
          {period === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                className="bg-white h-9 text-xs"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                className="bg-white h-9 text-xs"
              />
            </div>
          )}
        </div>

        {/* Dynamic Search Box and Summary row */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-11 rounded-xl h-10"
            />
          </div>

          {data && (
            <div className="bg-[#ba1a1a]/5 border border-[#ba1a1a]/10 rounded-2xl py-2.5 px-4 flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Period Expenses</p>
                <p className="text-base font-extrabold text-[#ba1a1a] tabular-nums mt-0.5">
                  -{formatCurrency(data.meta.totalAmount ?? 0)}
                </p>
              </div>
              <div className="text-right border-l border-red-100/50 pl-6">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Count</p>
                <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{data.meta.total} items</p>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No expenses recorded</p>
            <Link to="/expenses/new">
              <Button className="mt-4">Add your first expense</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden md:block border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.03)] rounded-[24px] overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-600">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Description</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Category</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Tax Category</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Method</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                        {isSuperAdmin && <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none"></th>}
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
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100/35 shadow-[0_2px_6px_rgba(186,26,26,0.01)] flex items-center justify-center text-[11px] font-bold shrink-0 select-none">
                                {getInitials(expense.recipient || expense.description)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{expense.description}</p>
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
                              <Badge variant={expense.isDeductible ? 'success' : 'destructive'} className="rounded-md font-semibold text-xs py-0.5">
                                {TAX_CATEGORY_LABELS[expense.taxCategory]}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-350">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                            {formatDate(expense.expenseDate)}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-650">
                            {expense.paymentMethod.replace('_', ' ')}
                          </td>
                          <td className="px-6 py-4 text-right font-extrabold text-[#ba1a1a] tabular-nums text-sm">
                            -{formatCurrency(expense.amount)}
                          </td>
                          {isSuperAdmin && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link to={`/expenses/${expense.id}/edit`}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => handleDelete(expense.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                  className="bg-white rounded-[24px] p-5 shadow-[0px_8px_24px_rgba(0,55,176,0.03)] border-0 transition-all duration-300 hover:shadow-[0px_12px_32px_rgba(0,55,176,0.06)] relative"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-650 border border-rose-100/35 flex items-center justify-center text-xs font-bold shrink-0 select-none">
                        {getInitials(expense.recipient || expense.description)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{expense.description}</p>
                        {expense.recipient && (
                          <span className="text-xs text-slate-500 font-semibold block mt-0.5">{expense.recipient}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#ba1a1a] shrink-0 tabular-nums">
                      -{formatCurrency(expense.amount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider rounded-md py-0.5">
                      {expense.category?.name ?? 'Uncategorized'}
                    </Badge>
                    {expense.taxCategory && expense.taxCategory !== 'UNCATEGORIZED' && (
                      <Badge variant={expense.isDeductible ? 'success' : 'destructive'} className="text-[10px] font-bold uppercase tracking-wider rounded-md py-0.5">
                        {TAX_CATEGORY_LABELS[expense.taxCategory]}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#eef4ff]/50">
                    <span className="text-xs text-slate-400 font-medium">
                      {formatDate(expense.expenseDate)} ({expense.paymentMethod.replace('_', ' ')})
                    </span>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1.5 -my-2.5">
                        <Link 
                          to={`/expenses/${expense.id}/edit`}
                          className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors min-h-[44px]"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </Link>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-full hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer min-h-[44px]"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination & Limit Selector */}
        {data && data.meta.total > 10 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#eef4ff]/50 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Show:</span>
              <div className="relative inline-block text-left">
                <button
                  onClick={() => setLimitOpen(!limitOpen)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-[0px_4px_12px_rgba(0,55,176,0.01)] cursor-pointer min-w-[120px]"
                >
                  <span>{limit} per page</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200", limitOpen && "rotate-180")} strokeWidth={1.5} />
                </button>

                {limitOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setLimitOpen(false)}
                    />
                    <div className="absolute bottom-11 left-0 w-full min-w-[120px] rounded-xl bg-white py-1 shadow-[0px_12px_32px_rgba(0,55,176,0.08)] ring-1 ring-black/5 z-20 animate-in fade-in slide-in-from-bottom-1 duration-150 text-left">
                      {([10, 25, 50, 100] as const).map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setLimit(val);
                            setPage(1);
                            setLimitOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-3.5 py-2.5 text-xs font-semibold transition-colors block cursor-pointer",
                            limit === val 
                              ? "bg-[#0037b0]/5 text-[#0037b0]" 
                              : "text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          {val} per page
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {data.meta.totalPages > 1 && (
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
      </div>

      {/* Mobile Floating Action Button */}
      <Link 
        to="/expenses/new" 
        className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
        aria-label="Add Expense"
      >
        <Plus className="h-6 w-6" strokeWidth={1.5} />
      </Link>
    </div>
  )
}
