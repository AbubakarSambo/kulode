import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui'
import { reportsApi, type ReportPeriod } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'
import { posthog } from '@/lib/posthog'

const DONUT_COLORS = ['#1d4ed8', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#6b7280']

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

  const { data: topServicesData } = useQuery({
    queryKey: ['reports', 'top-services', period],
    queryFn: () => reportsApi.getTopServices({ period }),
  })

  const { data: topProductsData } = useQuery({
    queryKey: ['reports', 'top-products', period],
    queryFn: () => reportsApi.getTopProducts({ period }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Reports"
        description="Analyze your financial performance"
        action={
          <Select
            value={period}
            onChange={(e) => {
              const newPeriod = e.target.value as ReportPeriod
              setPeriod(newPeriod)
              posthog.capture('report_period_changed', { period: newPeriod })
            }}
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

            {/* Top Services & Products by Revenue */}
            {(!!topServicesData?.services?.length || !!topProductsData?.products?.length) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {!!topServicesData?.services?.length && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Services by Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={topServicesData.services}
                              dataKey="revenue"
                              nameKey="label"
                              cx="50%"
                              cy="40%"
                              innerRadius={50}
                              outerRadius={80}
                            >
                              {topServicesData.services.map((_: any, i: number) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                            <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!!topProductsData?.products?.length && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Products by Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={topProductsData.products}
                              dataKey="revenue"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                            >
                              {topProductsData.products.map((_: any, i: number) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                            <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

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

            {/* Cashflow Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Monthly Cashflow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflow?.monthly ?? []}>
                      <defs>
                        <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} fill="url(#incomeGradient)" dot={false} />
                      <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expensesGradient)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
