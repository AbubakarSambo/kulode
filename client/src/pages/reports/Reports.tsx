import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui'
import { reportsApi, type ReportPeriod } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('THIS_YEAR')

  const { data: cashflow, isLoading } = useQuery({
    queryKey: ['reports', 'cashflow', period],
    queryFn: () => reportsApi.getCashflow({ period }),
  })

  const { data: expenseBreakdown } = useQuery({
    queryKey: ['reports', 'expenses', period],
    queryFn: () => reportsApi.getExpenses({ period }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Reports"
        description="Analyze your financial performance"
        action={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="w-40"
          >
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_MONTH">Last Month</option>
            <option value="THIS_QUARTER">This Quarter</option>
            <option value="THIS_YEAR">This Year</option>
            <option value="LAST_YEAR">Last Year</option>
          </Select>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground">Total Income</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">
                    {formatCurrency(cashflow?.totals.income ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    {formatCurrency(cashflow?.totals.expenses ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                  <p className={`mt-1 text-2xl font-bold ${(cashflow?.totals.net ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(cashflow?.totals.net ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Cashflow Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly Cashflow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashflow?.monthly ?? []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`} />
                      <Tooltip 
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Bar dataKey="income" name="Income" fill="#10b981" />
                      <Bar dataKey="expenses" name="Expenses" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Expenses by Category */}
            <Card>
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseBreakdown?.byCategory?.map((cat: any) => (
                    <div key={cat.categoryId || 'uncategorized'} className="flex items-center justify-between">
                      <span className="font-medium">{cat.categoryName}</span>
                      <span className="text-muted-foreground">{formatCurrency(cat.total)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
