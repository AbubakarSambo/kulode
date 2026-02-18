import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, CreditCard, TrendingUp, TrendingDown, AlertCircle, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/layout'
import { OnboardingChecklist } from '@/components/OnboardingChecklist'
import { Card, CardContent, CardHeader, CardTitle, Badge, Select, Input } from '@/components/ui'
import { reportsApi, type ReportPeriod } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'

const periodLabels: Record<ReportPeriod, string> = {
  THIS_MONTH: 'this month',
  LAST_MONTH: 'last month',
  THIS_QUARTER: 'this quarter',
  LAST_QUARTER: 'last quarter',
  THIS_YEAR: 'this year',
  LAST_YEAR: 'last year',
  CUSTOM: 'the selected period',
}

export function DashboardPage() {
  const [period, setPeriod] = useState<ReportPeriod>('THIS_MONTH')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const filters = period === 'CUSTOM'
    ? { period, startDate: startDate || undefined, endDate: endDate || undefined }
    : { period }

  const { data: summary } = useQuery({
    queryKey: ['reports', 'summary', period, startDate, endDate],
    queryFn: () => reportsApi.getSummary(filters),
  })

  const { data: outstanding } = useQuery({
    queryKey: ['reports', 'outstanding'],
    queryFn: () => reportsApi.getOutstanding(),
  })

  const { data: incomeData } = useQuery({
    queryKey: ['reports', 'income', period, startDate, endDate],
    queryFn: () => reportsApi.getIncome(filters),
  })

  const topClient = incomeData?.topClients?.[0]

  const stats = [
    {
      title: 'Income',
      value: summary?.income.total ?? 0,
      subtext: `${summary?.income.paymentCount ?? 0} payments`,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Expenses',
      value: summary?.expenses.total ?? 0,
      subtext: `${summary?.expenses.expenseCount ?? 0} expenses`,
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Profit',
      value: summary?.profit ?? 0,
      subtext: `${summary?.profitMargin ?? 0}% margin`,
      icon: CreditCard,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Outstanding',
      value: outstanding?.summary?.totalOutstanding ?? 0,
      subtext: `${outstanding?.summary?.overdueCount ?? 0} overdue`,
      icon: AlertCircle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Dashboard"
        description={`Overview of your business performance ${periodLabels[period]}`}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
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
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-36"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-36"
                />
              </>
            )}
          </div>
        }
      />
      
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <OnboardingChecklist />

        {/* Stats Grid */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="mt-1 text-2xl font-bold">
                      {formatCurrency(stat.value)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.subtext}</p>
                  </div>
                  <div className={`rounded-full p-3 ${stat.bgColor}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Invoice Status */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(summary?.invoices ?? {}).map(([status, data]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          status === 'paid' ? 'success' :
                          status === 'overdue' ? 'destructive' :
                          status === 'draft' ? 'secondary' :
                          'default'
                        }
                      >
                        {status.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {data.count} invoices
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(data.total)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Outstanding */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Outstanding Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outstanding?.invoices?.length > 0 ? (
                <div className="space-y-3">
                  {outstanding.invoices.slice(0, 5).map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{inv.invoiceNumber}</p>
                        <p className="text-sm text-muted-foreground">{inv.client.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(inv.outstanding)}</p>
                        {inv.isOverdue && (
                          <p className="text-xs text-destructive">
                            {inv.daysPastDue} days overdue
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">No outstanding invoices</p>
              )}
            </CardContent>
          </Card>

          {/* Top Client */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Top Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topClient ? (
                <div className="space-y-2">
                  <p className="text-lg font-bold">
                    {topClient.clientId ? (
                      <Link to={`/clients/${topClient.clientId}`} className="hover:underline">
                        {topClient.clientName}
                      </Link>
                    ) : (
                      topClient.clientName
                    )}
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(topClient.total)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {topClient.paymentCount} payment{topClient.paymentCount !== 1 ? 's' : ''} received
                  </p>
                </div>
              ) : (
                <p className="text-center text-muted-foreground">No payments in this period</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
