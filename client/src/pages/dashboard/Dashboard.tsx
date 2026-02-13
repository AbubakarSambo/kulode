import { useQuery } from '@tanstack/react-query'
import { FileText, CreditCard, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { reportsApi } from '@/api'
import { formatCurrency } from '@/lib/utils'

export function DashboardPage() {
  const { data: summary } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => reportsApi.getSummary({ period: 'THIS_MONTH' }),
  })

  const { data: outstanding } = useQuery({
    queryKey: ['reports', 'outstanding'],
    queryFn: () => reportsApi.getOutstanding(),
  })

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
        description="Overview of your business performance this month"
      />
      
      <div className="flex-1 overflow-auto p-4 sm:p-6">
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
        <div className="grid gap-6 lg:grid-cols-2">
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
        </div>
      </div>
    </div>
  )
}
