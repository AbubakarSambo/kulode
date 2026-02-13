import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Card, CardContent, Badge } from '@/components/ui'
import { expensesApi } from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'

export function ExpensesListPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { page }],
    queryFn: () => expensesApi.list({ page, limit: 20 }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Expenses"
        description="Track your business expenses"
        action={
          <Link to="/expenses/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
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
                    <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Method</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(expense.expenseDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {expense.paymentMethod.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">
                        -{formatCurrency(expense.amount)}
                      </td>
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
