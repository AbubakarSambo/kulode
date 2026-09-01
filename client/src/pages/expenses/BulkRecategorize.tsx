import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { posthog } from '@/lib/posthog'
import { CheckSquare, Square, Tags } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input, DropdownPanel } from '@/components/ui'
import { expensesApi } from '@/api'
import { formatCurrency, cn } from '@/lib/utils'
import type { TaxCategory } from '@/types'
import { TAX_CATEGORY_LABELS, TAX_CATEGORIES } from '@/types'

export function BulkRecategorizePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetCategory, setTargetCategory] = useState<TaxCategory>('UNCATEGORIZED')
  const [page, setPage] = useState(1)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', 'bulk', page],
    queryFn: () => expensesApi.list({ page, limit: 100, taxCategory: 'UNCATEGORIZED' }),
  })

  const expenses = data?.data ?? []
  const filteredExpenses = expenses.filter(exp => 
    exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (exp.recipient && exp.recipient.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  const total = data?.meta.total ?? 0

  const mutation = useMutation({
    mutationFn: () => expensesApi.bulkRecategorize(Array.from(selectedIds), targetCategory),
    onSuccess: (result) => {
      posthog.capture('expenses_bulk_recategorized', { count: result.updated })
      toast.success(`${result.updated} expense${result.updated !== 1 ? 's' : ''} recategorized`)
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setSelectedIds(new Set())
    },
    onError: () => {
      toast.error('Failed to recategorize expenses')
    },
  })

  const toggleAll = () => {
    if (selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredExpenses.map((e) => e.id)))
    }
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = filteredExpenses.length > 0 && selectedIds.size === filteredExpenses.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Bulk Recategorize Expenses"
        description={`${total} uncategorized expense${total !== 1 ? 's' : ''} — assign tax categories for your filing pack`}
        action={
          <Button variant="outline" className="h-10 cursor-pointer" onClick={() => navigate('/expenses')}>
            Back to Expenses
          </Button>
        }
      />
 
      <div className="flex-1 overflow-auto p-4 pb-32 sm:p-6">
        {/* Action bar */}
        <Card className="mb-6 border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px]">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select expenses below'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                <div className="relative w-full sm:w-56">
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 shadow-sm cursor-pointer"
                  >
                    <span className="truncate">{TAX_CATEGORY_LABELS[targetCategory]}</span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className={cn("h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0", isCategoryDropdownOpen && "rotate-180")}
                      strokeWidth={1.5}
                    />
                  </button>

                  <DropdownPanel
                    isOpen={isCategoryDropdownOpen}
                    onClose={() => setIsCategoryDropdownOpen(false)}
                    align="right"
                    widthClass="w-64"
                    className="max-h-72 overflow-y-auto"
                  >
                    {TAX_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setTargetCategory(cat)
                          setIsCategoryDropdownOpen(false)
                        }}
                        className={cn(
                          "w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-colors block cursor-pointer",
                          targetCategory === cat 
                            ? "bg-[#0037b0]/5 text-[#0037b0]" 
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {TAX_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </DropdownPanel>
                </div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={selectedIds.size === 0 || mutation.isPending}
                  isLoading={mutation.isPending}
                  className="w-full sm:w-auto h-11 rounded-xl px-5 text-xs font-semibold text-white bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  Apply to {selectedIds.size > 0 ? selectedIds.size : '…'} expenses
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
 
        {/* Expenses table / list card */}
        <Card className="border-0 bg-white shadow-[0px_12px_32px_rgba(0,55,176,0.08)] rounded-[24px] overflow-visible">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-baseline gap-2">
                <span className="text-sm font-extrabold text-slate-800">Uncategorized Expenses</span>
                {total > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    Showing {filteredExpenses.length} of {total}
                  </span>
                )}
              </CardTitle>
              <div className="relative w-full sm:max-w-xs">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
                <Input
                  placeholder="Search description or vendor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 text-xs rounded-xl bg-white border-border"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="p-12 text-center">
                <Tags className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="font-bold text-slate-850 text-sm">All expenses are categorized</p>
                <p className="mt-1 text-xs text-slate-400 font-medium">
                  Great work! Every expense has a tax category assigned.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-visible">
                  <table className="w-full min-w-[700px] border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-650">
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left w-12 select-none">
                          <button type="button" onClick={toggleAll} className="text-slate-450 hover:text-[#0037b0] transition-colors cursor-pointer flex items-center justify-center">
                            {allSelected
                              ? <CheckSquare className="h-5 w-5 text-[#0037b0]" />
                              : <Square className="h-5 w-5" />
                            }
                          </button>
                        </th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Date</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Description</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Category</th>
                        <th className="sticky top-0 z-10 bg-white border-b border-[#eef4ff]/30 px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-0">
                      {filteredExpenses.map((exp, index) => {
                        const isSelected = selectedIds.has(exp.id)
                        return (
                          <tr
                            key={exp.id}
                            onClick={() => toggle(exp.id)}
                            className={cn(
                              "cursor-pointer transition-all duration-150 hover:bg-[#eef4ff]/20",
                              isSelected ? "bg-[#0037b0]/04" : (index % 2 === 0 ? "bg-transparent" : "bg-[#eef4ff]/08")
                            )}
                          >
                            <td className="px-6 py-4">
                              {isSelected
                                ? <CheckSquare className="h-5 w-5 text-[#0037b0]" />
                                : <Square className="h-5 w-5 text-slate-300 hover:text-slate-400" />
                              }
                            </td>
                            <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                              {new Date(exp.expenseDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-900 text-sm">{exp.description}</p>
                              {(exp.vendor?.name || exp.recipient) && (
                                <p className="text-xs text-slate-500 font-semibold mt-0.5">{exp.vendor?.name || exp.recipient}</p>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {exp.category ? (
                                <Badge variant="secondary" className="rounded-md font-semibold text-xs py-0.5">
                                  {exp.category.name}
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-350">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-slate-800 tabular-nums text-sm">
                              {formatCurrency(exp.amount)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards List View */}
                <div className="flex flex-col gap-3 md:hidden p-4">
                  {filteredExpenses.length > 0 && (
                    <div className="flex items-center justify-between px-1 pb-1 text-slate-500 select-none">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-slate-500 hover:text-[#0037b0] transition-colors cursor-pointer flex items-center gap-2"
                      >
                        {allSelected ? (
                          <CheckSquare className="h-5 w-5 text-[#0037b0]" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-400" />
                        )}
                        <span className="text-xs font-semibold">Select All ({filteredExpenses.length})</span>
                      </button>
                    </div>
                  )}
                  {filteredExpenses.map((exp) => {
                    const isSelected = selectedIds.has(exp.id)
                    return (
                      <div
                        key={exp.id}
                        onClick={() => toggle(exp.id)}
                        className={cn(
                          "bg-white rounded-[20px] p-4 shadow-[0px_8px_24px_rgba(0,55,176,0.06)] border transition-all duration-200 flex items-start gap-3.5 cursor-pointer select-none",
                          isSelected ? "border-[#0037b0] bg-[#0037b0]/02" : "border-slate-100"
                        )
                      }
                      >
                        <div className="pt-0.5 shrink-0">
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-[#0037b0]" />
                            : <Square className="h-5 w-5 text-slate-300" />
                          }
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900 text-sm leading-snug">{exp.description}</p>
                            <span className="text-sm font-extrabold text-slate-850 tabular-nums shrink-0">
                              {formatCurrency(exp.amount)}
                            </span>
                          </div>
                          
                          {exp.category && (
                            <div className="mt-1.5">
                              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider rounded-md py-0.5">
                                {exp.category.name}
                              </Badge>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#eef4ff]/50 text-[10px] font-semibold text-slate-400">
                            <span>{new Date(exp.expenseDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            {exp.vendor?.name && <span className="truncate max-w-[150px]">{exp.vendor.name}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
 
        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 px-3 rounded-lg text-xs"
            >
              Previous
            </Button>
            <span className="flex items-center px-4 text-xs font-semibold text-slate-500">
              Page {page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 px-3 rounded-lg text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
