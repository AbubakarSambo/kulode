import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckSquare, Square, Tags } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Select, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { expensesApi } from '@/api'
import { formatCurrency } from '@/lib/utils'
import type { TaxCategory } from '@/types'
import { TAX_CATEGORY_LABELS, TAX_CATEGORIES } from '@/types'

export function BulkRecategorizePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetCategory, setTargetCategory] = useState<TaxCategory>('UNCATEGORIZED')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', 'bulk', page],
    queryFn: () => expensesApi.list({ page, limit: 50, taxCategory: 'UNCATEGORIZED' }),
  })

  const expenses = data?.data ?? []
  const total = data?.meta.total ?? 0

  const mutation = useMutation({
    mutationFn: () => expensesApi.bulkRecategorize(Array.from(selectedIds), targetCategory),
    onSuccess: (result) => {
      toast.success(`${result.updated} expense${result.updated !== 1 ? 's' : ''} recategorized`)
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setSelectedIds(new Set())
    },
    onError: () => {
      toast.error('Failed to recategorize expenses')
    },
  })

  const toggleAll = () => {
    if (selectedIds.size === expenses.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(expenses.map((e) => e.id)))
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

  const allSelected = expenses.length > 0 && selectedIds.size === expenses.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Bulk Recategorize Expenses"
        description={`${total} uncategorized expense${total !== 1 ? 's' : ''} — assign tax categories for your filing pack`}
        action={
          <Button variant="outline" onClick={() => navigate('/expenses')}>
            Back to Expenses
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Action bar */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select expenses below'}
                </span>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Select
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value as TaxCategory)}
                  className="w-56"
                >
                  {TAX_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{TAX_CATEGORY_LABELS[cat]}</option>
                  ))}
                </Select>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={selectedIds.size === 0 || mutation.isPending}
                  isLoading={mutation.isPending}
                >
                  Apply to {selectedIds.size > 0 ? selectedIds.size : '…'} expenses
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Uncategorized Expenses</span>
              {total > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  Showing {expenses.length} of {total}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="p-12 text-center">
                <Tags className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">All expenses are categorized</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Great work! Every expense has a tax category assigned.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-10 px-4 py-3 text-left">
                        <button type="button" onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                          {allSelected
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4" />
                          }
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expenses.map((exp) => (
                      <tr
                        key={exp.id}
                        onClick={() => toggle(exp.id)}
                        className="cursor-pointer hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          {selectedIds.has(exp.id)
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4 text-muted-foreground" />
                          }
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(exp.expenseDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{exp.description}</p>
                          {(exp.vendor?.name || exp.recipient) && (
                            <p className="text-xs text-muted-foreground">{exp.vendor?.name || exp.recipient}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {exp.category ? (
                            <Badge variant="secondary">{exp.category.name}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center px-3 text-sm text-muted-foreground">
              Page {page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
