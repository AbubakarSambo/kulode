import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Users, DollarSign, Coins, FileText } from 'lucide-react'
import { Header } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { platformApi } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import { formatCurrency } from '@/lib/utils'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (user && !user.isPlatformAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'dashboard'],
    queryFn: () => platformApi.getDashboard(),
    enabled: !!user?.isPlatformAdmin,
  })

  if (!user?.isPlatformAdmin) return null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Platform Admin"
        description="Overview of all organizations and platform metrics"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading platform data...</div>
          </div>
        ) : data ? (
          <>
            {/* Stat Cards */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Organizations</p>
                      <p className="mt-1 text-2xl font-bold">{data.organizations.total}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.organizations.newThisMonth} new this month
                      </p>
                    </div>
                    <div className="rounded-full bg-blue-50 p-3">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                      <p className="mt-1 text-2xl font-bold">{data.users.total}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.organizations.active} active orgs
                      </p>
                    </div>
                    <div className="rounded-full bg-purple-50 p-3">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">GMV</p>
                      <p className="mt-1 text-2xl font-bold">{formatCurrency(data.revenue.gmv)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Total invoice volume
                      </p>
                    </div>
                    <div className="rounded-full bg-green-50 p-3">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Platform Revenue</p>
                      <p className="mt-1 text-2xl font-bold">{formatCurrency(data.revenue.platformFees)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        From platform fees
                      </p>
                    </div>
                    <div className="rounded-full bg-amber-50 p-3">
                      <Coins className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3-column grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Invoice Status Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Invoice Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(data.invoices).map(([status, info]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              status === 'PAID' ? 'success' :
                              status === 'OVERDUE' ? 'destructive' :
                              status === 'DRAFT' ? 'secondary' :
                              'default'
                            }
                          >
                            {status.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {info.count}
                          </span>
                        </div>
                        <span className="font-medium">
                          {formatCurrency(info.total)}
                        </span>
                      </div>
                    ))}
                    {Object.keys(data.invoices).length === 0 && (
                      <p className="text-center text-muted-foreground">No invoices yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Signups */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Recent Signups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.recentSignups.length > 0 ? (
                    <div className="space-y-3">
                      {data.recentSignups.map((org) => (
                        <div key={org.id} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{org.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {org.userCount} users &middot; {org.invoiceCount} invoices
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(org.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground">No organizations yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Organizations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Top Organizations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topOrganizations.length > 0 ? (
                    <div className="space-y-3">
                      {data.topOrganizations.map((org, index) => (
                        <div key={org.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-muted-foreground">
                              #{index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{org.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {org.invoiceCount} invoices
                              </p>
                            </div>
                          </div>
                          <span className="font-medium">
                            {formatCurrency(org.volume)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground">No data yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
