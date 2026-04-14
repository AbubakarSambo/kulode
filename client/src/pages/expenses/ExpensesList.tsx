import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge, Select, Input } from '@/components/ui'
import { expensesApi } from '@/api'
import { type ReportPeriod } from '@/api/reports'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { TAX_CATEGORY_LABELS } from '@/types'

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

export function ExpensesListPage() {
  const [page, setPage] = useState(1)
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
      toast.success('Expense deleted')
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
    queryKey: ['expenses', { page, period, filterStart, filterEnd }],
    queryFn: () => expensesApi.list({ page, limit: 20, startDate: filterStart, endDate: filterEnd }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Expenses"
        description="Track your business expenses"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={period}
              onChange={(e) => { setPeriod(e.target.value as ReportPeriod); setPage(1) }}
              className="w-40"
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
                  className="w-36"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="w-36"
                />
              </>
            )}
            <Link to="/expenses/bulk-recategorize">
              <Button variant="outline">
                <Tags className="mr-2 h-4 w-4" />
                Bulk Recategorize
              </Button>
            </Link>
            <Link to="/expenses/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {data && (
          <div className="mb-6">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                <p className="mt-1 text-2xl font-bold text-destructive">
                  -{formatCurrency(data.meta.totalAmount ?? 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{data.meta.total} expense{data.meta.total !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No expenses recorded</p>
            <Link to="/expenses/new">
              <Button className="mt-4">Add your first expense</Button>
            </Link>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Tax Category</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Method</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                    {isSuperAdmin && <th className="px-4 py-3 text-right text-sm font-medium"></th>}
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((expense) => (
                    <tr key={expense.id} className="border-b last:border-0 hover:bg-muted/25">
                      <td className="px-4 py-3">
                        <p className="font-medium">{expense.description}</p>
                        {expense.recipient && (
                          <p className="text-sm text-muted-foreground">{expense.recipient}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {expense.category?.name ?? 'Uncategorized'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {expense.taxCategory && expense.taxCategory !== 'UNCATEGORIZED' ? (
                          <Badge variant={expense.isDeductible ? 'success' : 'destructive'}>
                            {TAX_CATEGORY_LABELS[expense.taxCategory]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(expense.expenseDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {expense.paymentMethod.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">
                        -{formatCurrency(expense.amount)}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/expenses/${expense.id}/edit`}>
                              <Button variant="ghost" size="sm">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(expense.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
        )}

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === data.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
