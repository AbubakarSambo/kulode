import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Building03Icon,
  UserGroupIcon,
  MoneyReceive02Icon,
  Coins01Icon,
  Invoice03Icon,
  Crown02Icon,
  Search01Icon,
  Settings02Icon,
  Cancel01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PercentCircleIcon,
  TrendingUpDownIcon,
  AnalyticsIcon,
  DashboardBrowsingIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons'
import { Header } from '@/components/layout'
import { Card, CardContent, Badge, Input, FilterSelect, Button, Label } from '@/components/ui'
import { platformApi } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { PlatformOrganizationDetails } from '@/types'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  const [activeTab, setActiveTab] = useState<'overview' | 'organizations' | 'revenue'>('overview')


  // Organizations query state
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [grandfatheredFilter, setGrandfatheredFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const limit = 10

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  // Manage Organization state
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)

  useEffect(() => {
    if (user && !user.isPlatformAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  // Dashboard Overview Query
  const { data: dashboardData, isLoading: isLoadingDashboard } = useQuery({
    queryKey: ['platform', 'dashboard'],
    queryFn: () => platformApi.getDashboard(),
    enabled: !!user?.isPlatformAdmin && activeTab !== 'organizations',
  })

  // Organizations List Query
  const { data: orgsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: [
      'platform',
      'organizations',
      {
        search: debouncedSearch,
        planTier: planFilter,
        subscriptionStatus: statusFilter,
        isGrandfathered: grandfatheredFilter,
        page,
        limit,
      },
    ],
    queryFn: () =>
      platformApi.getOrganizations({
        search: debouncedSearch || undefined,
        planTier: planFilter || undefined,
        subscriptionStatus: statusFilter || undefined,
        isGrandfathered: grandfatheredFilter === 'all' ? undefined : grandfatheredFilter === 'true',
        page,
        limit,
      }),
    enabled: !!user?.isPlatformAdmin && activeTab === 'organizations',
  })

  if (!user?.isPlatformAdmin) return null

  const handleTabChange = (tab: 'overview' | 'organizations' | 'revenue') => {
    setActiveTab(tab)
  }

  // MoM trend chip — inline, uses DESIGN.md token colors
  // secondary_fixed (#6ffbbe) for positive, tertiary_fixed (#ffddb8) for negative
  function MoMBadge({ value }: { value: number | undefined | null }) {
    if (value === undefined || value === null) return null
    const isPositive = value >= 0
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-tight ${
          isPositive
            ? 'bg-[#6ffbbe] text-[#003822]'
            : 'bg-[#ffddb8] text-[#4c2205]'
        }`}
      >
        <HugeiconsIcon
          icon={isPositive ? ArrowUp01Icon : ArrowDown01Icon}
          size={9}
          strokeWidth={2.5}
          color="currentColor"
        />
        {Math.abs(value)}%
      </span>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#f8f9ff]">
      <Header
        title="Platform Admin"
        description="Overview of all organizations, revenue growth, and tenant control parameters."
      />

      {/* Tabs Navigation */}
      <div className="px-6 border-b border-slate-200/50 bg-white">
        <div className="flex gap-6">
          {(['overview', 'organizations', 'revenue'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`py-4 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer min-h-[44px] ${
                activeTab === tab
                  ? 'text-[#0037b0]'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'overview' && 'Overview'}
              {tab === 'organizations' && 'Organizations'}
              {tab === 'revenue' && 'Revenue & Billing'}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0037b0] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {isLoadingDashboard ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
                  <p className="text-xs text-slate-500 font-semibold">Loading platform analytics...</p>
                </div>
              </div>
            ) : dashboardData ? (
              <div className="space-y-6">
                {/* Stats Cards Row */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {/* Stat Card: Total Organizations */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white hover:shadow-[0px_16px_40px_rgba(0,55,176,0.08)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                            Total Organizations
                          </p>
                          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#121c28]">
                            {dashboardData.organizations.total}
                          </p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <MoMBadge value={dashboardData.organizations.changePct} />
                            <span className="text-[10px] text-[#434655]">
                              {dashboardData.organizations.newThisMonth} this month
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#eef4ff] p-3 shrink-0 ml-2">
                          <HugeiconsIcon icon={Building03Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stat Card: Total Users */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white hover:shadow-[0px_16px_40px_rgba(0,55,176,0.08)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                            Total Users
                          </p>
                          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#121c28]">
                            {dashboardData.users.total}
                          </p>
                          <p className="mt-2 text-[10px] text-[#434655]">
                            <span className="font-bold text-[#121c28]">{dashboardData.organizations.active}</span> active tenants
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#eef4ff] p-3 shrink-0 ml-2">
                          <HugeiconsIcon icon={UserGroupIcon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stat Card: GMV */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white hover:shadow-[0px_16px_40px_rgba(0,55,176,0.08)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                            Gross Merch. Vol
                          </p>
                          <p className="mt-1.5 text-xl font-bold tracking-tight text-[#121c28] truncate">
                            {formatCurrency(dashboardData.revenue.gmv)}
                          </p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <MoMBadge value={dashboardData.revenue.gmvChangePct} />
                            <span className="text-[10px] text-[#434655]">vs last month</span>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#eef4ff] p-3 shrink-0 ml-2">
                          <HugeiconsIcon icon={MoneyReceive02Icon} size={18} strokeWidth={1.5} className="text-[#006c49]" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stat Card: Platform Fees */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white hover:shadow-[0px_16px_40px_rgba(0,55,176,0.08)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                            Platform Fees
                          </p>
                          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#121c28] truncate">
                            {formatCurrency(dashboardData.revenue.platformFees)}
                          </p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <MoMBadge value={dashboardData.revenue.platformFeesChangePct} />
                            <span className="text-[10px] text-[#434655]">vs last month</span>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#eef4ff] p-3 shrink-0 ml-2">
                          <HugeiconsIcon icon={Coins01Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stat Card: SaaS Subscriptions */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white hover:shadow-[0px_16px_40px_rgba(0,55,176,0.08)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                            SaaS Revenue
                          </p>
                          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#121c28] truncate">
                            {formatCurrency(dashboardData.subscriptions.revenue)}
                          </p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <MoMBadge value={dashboardData.subscriptions.revenueChangePct} />
                            <span className="text-[10px] text-[#434655]">vs last month</span>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#eef4ff] p-3 shrink-0 ml-2">
                          <HugeiconsIcon icon={Crown02Icon} size={18} strokeWidth={1.5} className="text-[#0037b0]" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Lists Grid */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Recent Signups */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white overflow-hidden">
                    <div className="px-6 pt-6 pb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#121c28] flex items-center gap-2">
                        <HugeiconsIcon icon={Building03Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                        Recent Signups
                      </h3>
                      <button
                        onClick={() => handleTabChange('organizations')}
                        className="text-xs font-semibold text-[#0037b0] hover:underline"
                      >
                        View All
                      </button>
                    </div>
                    <CardContent className="px-6 pb-6">
                      {dashboardData.recentSignups.length > 0 ? (
                        <div className="space-y-1.5">
                          {dashboardData.recentSignups.map((org, idx) => (
                            <div
                              key={org.id}
                              className={`flex items-center justify-between p-3 rounded-2xl ${
                                idx % 2 === 0 ? 'bg-[#f8f9ff]/80' : 'bg-white'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-slate-800">{org.name}</p>
                                  <Badge
                                    variant={
                                      org.planTier === 'BUSINESS' ? 'success' :
                                      org.planTier === 'PRO' ? 'default' :
                                      'secondary'
                                    }
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {org.planTier}
                                  </Badge>
                                  {org.isGrandfathered && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                      Grandfathered
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                  {org.userCount} users &middot; {org.invoiceCount} invoices
                                </p>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400">
                                {new Date(org.createdAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-xs text-slate-400 py-8">No organizations found</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Organizations */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white overflow-hidden">
                    <div className="px-6 pt-6 pb-2">
                      <h3 className="text-sm font-bold text-[#121c28] flex items-center gap-2">
                        <HugeiconsIcon icon={TrendingUpDownIcon} size={16} strokeWidth={1.5} className="text-[#006c49]" />
                        Top Organizations by Volume
                      </h3>
                    </div>
                    <CardContent className="px-6 pb-6">
                      {dashboardData.topOrganizations.length > 0 ? (
                        <div className="space-y-1.5">
                          {dashboardData.topOrganizations.map((org, index) => (
                            <div
                              key={org.id}
                              className={`flex items-center justify-between p-3 rounded-2xl ${
                                index % 2 === 0 ? 'bg-[#f8f9ff]/80' : 'bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-300">
                                  #{String(index + 1).padStart(2, '0')}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-slate-800">{org.name}</p>
                                    <Badge
                                      variant={
                                        org.planTier === 'BUSINESS' ? 'success' :
                                        org.planTier === 'PRO' ? 'default' :
                                        'secondary'
                                      }
                                      className="text-[9px] px-1.5 py-0"
                                    >
                                      {org.planTier}
                                    </Badge>
                                  </div>
                                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                    {org.invoiceCount} invoices
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-[#121c28]">
                                {formatCurrency(org.volume)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-xs text-slate-400 py-8">No billing records found</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ORGANIZATIONS TAB */}
        {activeTab === 'organizations' && (
          <div className="space-y-6">
                {/* Search & Filters */}
            <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.02)] rounded-3xl bg-white">
              <CardContent className="p-4 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Input
                      placeholder="Search tenant name or email..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                    <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#c4c5d7]" />
                  </div>

                  {/* Plan Tier Filter */}
                  <FilterSelect
                    value={planFilter}
                    onChange={(val) => {
                      setPlanFilter(val)
                      setPage(1)
                    }}
                    options={[
                      { value: '', label: 'All Plan Tiers' },
                      { value: 'FREE', label: 'Free' },
                      { value: 'STARTER', label: 'Starter' },
                      { value: 'PRO', label: 'Pro' },
                      { value: 'BUSINESS', label: 'Business' },
                    ]}
                  />

                  {/* Status Filter */}
                  <FilterSelect
                    value={statusFilter}
                    onChange={(val) => {
                      setStatusFilter(val)
                      setPage(1)
                    }}
                    options={[
                      { value: '', label: 'All Statuses' },
                      { value: 'TRIALING', label: 'Trialing' },
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'PAST_DUE', label: 'Past Due' },
                      { value: 'CANCELLED', label: 'Cancelled' },
                      { value: 'EXPIRED', label: 'Expired' },
                    ]}
                  />

                  {/* Grandfathered Filter */}
                  <FilterSelect
                    value={grandfatheredFilter}
                    onChange={(val) => {
                      setGrandfatheredFilter(val)
                      setPage(1)
                    }}
                    options={[
                      { value: 'all', label: 'All Billings' },
                      { value: 'true', label: 'Grandfathered Only' },
                      { value: 'false', label: 'Regular Billing' },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Organizations Table */}
            <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.02)] rounded-3xl bg-white overflow-hidden">
              <CardContent className="p-0">
                {isLoadingOrgs ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
                      <p className="text-xs text-slate-500 font-semibold">Loading tenant directory...</p>
                    </div>
                  </div>
                ) : orgsData && orgsData.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#f8f9ff]/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="px-6 py-4">Organization</th>
                          <th className="px-6 py-4">Plan & Status</th>
                          <th className="px-6 py-4">Usage Parameters</th>
                          <th className="px-6 py-4">Platform Fee %</th>
                          <th className="px-6 py-4">Date Joined</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {orgsData.items.map((org, index) => (
                          <tr
                            key={org.id}
                            className={`hover:bg-[#f8f9ff]/50 transition-colors ${
                              index % 2 === 1 ? 'bg-slate-50/20' : ''
                            }`}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-[#0037b0]/5 rounded-xl flex items-center justify-center font-bold text-[#0037b0] select-none text-xs">
                                  {org.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{org.name}</p>
                                  <p className="text-[10px] font-semibold text-slate-400">{org.slug}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1 items-start">
                                <Badge
                                  variant={
                                    org.planTier === 'BUSINESS' ? 'success' :
                                    org.planTier === 'PRO' ? 'default' :
                                    'secondary'
                                  }
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {org.planTier}
                                </Badge>
                                <Badge
                                  variant={
                                    org.subscriptionStatus === 'ACTIVE' ? 'success' :
                                    org.subscriptionStatus === 'TRIALING' ? 'warning' :
                                    'destructive'
                                  }
                                  className="text-[8px] px-1 py-0 uppercase"
                                >
                                  {org.subscriptionStatus}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs text-slate-600">
                                <span className="font-bold text-slate-800">{org.userCount}</span> users &middot;{' '}
                                <span className="font-bold text-slate-800">{org.invoiceCount}</span> invoices
                              </div>
                              {org.isGrandfathered && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 mt-1 border-amber-300 text-amber-600 bg-amber-50/20">
                                  Grandfathered
                                </Badge>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-slate-700">
                                {org.platformFeePercent}%
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-500">
                                {new Date(org.createdAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant="outline"
                                onClick={() => setEditingOrgId(org.id)}
                                className="px-3 py-1.5 rounded-xl border border-[rgba(196,197,215,0.4)] hover:bg-[#eef4ff] hover:border-[#0037b0]/20 text-xs font-semibold flex items-center gap-1.5 ml-auto min-h-[36px] text-[#434655] hover:text-[#0037b0] transition-colors"
                              >
                                <HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={1.5} />
                                Configure
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-[#c4c5d7]">
                    <HugeiconsIcon icon={Building03Icon} size={40} strokeWidth={1} className="mb-2 text-[#c4c5d7]" />
                    <p className="text-sm font-semibold text-[#434655]">No organizations matched your criteria</p>
                  </div>
                )}

                {/* Pagination Controls */}
                {orgsData && orgsData.meta.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[rgba(196,197,215,0.15)] px-6 py-4 bg-white">
                    <span className="text-xs text-[#434655]">
                      Page <span className="font-bold text-[#121c28]">{page}</span> of{' '}
                      <span className="font-bold text-[#121c28]">{orgsData.meta.totalPages}</span>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer min-h-[36px] border-[rgba(196,197,215,0.4)] text-[#434655] hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors"
                      >
                        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        disabled={page === orgsData.meta.totalPages}
                        onClick={() => setPage((p) => Math.min(orgsData.meta.totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer min-h-[36px] border-[rgba(196,197,215,0.4)] text-[#434655] hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors"
                      >
                        Next
                        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* REVENUE TAB */}
        {activeTab === 'revenue' && (
          <>
            {isLoadingDashboard ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
                  <p className="text-xs text-slate-500 font-semibold">Loading platform billing data...</p>
                </div>
              </div>
            ) : dashboardData ? (
              <div className="space-y-6">
                {/* Revenue Summary row */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.12)] rounded-3xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white">
                    <CardContent className="p-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#93c5fd]">
                        Combined Platform Income
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-white">
                        {formatCurrency(
                          dashboardData.subscriptions.revenue + dashboardData.revenue.platformFees
                        )}
                      </p>
                      <div className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold text-[#bfdbfe]">
                        <HugeiconsIcon icon={TrendingUpDownIcon} size={14} strokeWidth={2} />
                        Aggregated cash flow streams
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.02)] rounded-3xl bg-white">
                    <CardContent className="p-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        SaaS Subscription Stream
                      </p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-[#121c28]">
                        {formatCurrency(dashboardData.subscriptions.revenue)}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400 font-semibold">
                        Sustained recurring membership fees
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.02)] rounded-3xl bg-white">
                    <CardContent className="p-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Transaction Fee Stream
                      </p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-[#121c28]">
                        {formatCurrency(dashboardData.revenue.platformFees)}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400 font-semibold">
                        Aggregated commission from client payment routes
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Plan Tier and Subscription Status Distributions */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Subscription Plans Distribution */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white overflow-hidden p-6">
                    <h3 className="text-sm font-bold text-[#121c28] flex items-center gap-2 mb-4">
                      <HugeiconsIcon icon={DashboardBrowsingIcon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                      Subscription Plan Distribution
                    </h3>
                    <div className="space-y-4">
                      {Object.entries(dashboardData.subscriptions.byPlan).map(([plan, count]) => {
                        const total = Object.values(dashboardData.subscriptions.byPlan).reduce(
                          (a, b) => a + b,
                          0
                        )
                        const pct = total > 0 ? (count / total) * 100 : 0
                        return (
                          <div key={plan} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <Badge
                                variant={
                                  plan === 'BUSINESS' ? 'success' :
                                  plan === 'PRO' ? 'default' :
                                  'secondary'
                                }
                                className="text-[9px] px-1.5 py-0"
                              >
                                {plan}
                              </Badge>
                              <span className="font-bold text-slate-700">
                                {count} orgs ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  plan === 'BUSINESS' ? 'bg-[#006c49]' :
                                  plan === 'PRO' ? 'bg-[#0037b0]' :
                                  'bg-[#c4c5d7]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>

                  {/* Subscription Statuses Distribution */}
                  <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white overflow-hidden p-6">
                    <h3 className="text-sm font-bold text-[#121c28] flex items-center gap-2 mb-4">
                      <HugeiconsIcon icon={AnalyticsIcon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                      Active vs. Trialing vs. Expired Statuses
                    </h3>
                    <div className="space-y-4">
                      {Object.entries(dashboardData.subscriptions.byStatus).map(([status, count]) => {
                        const total = Object.values(dashboardData.subscriptions.byStatus).reduce(
                          (a, b) => a + b,
                          0
                        )
                        const pct = total > 0 ? (count / total) * 100 : 0
                        return (
                          <div key={status} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <Badge
                                variant={
                                  status === 'ACTIVE' ? 'success' :
                                  status === 'TRIALING' ? 'warning' :
                                  'destructive'
                                }
                                className="text-[9px] px-1.5 py-0"
                              >
                                {status}
                              </Badge>
                              <span className="font-bold text-slate-700">
                                {count} orgs ({pct.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  status === 'ACTIVE' ? 'bg-[#006c49]' :
                                  status === 'TRIALING' ? 'bg-[#ba1a1a]/40' :
                                  'bg-[#ba1a1a]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>

                {/* Invoices Volume by Status */}
                <Card className="border-0 shadow-[0px_12px_32px_rgba(0,55,176,0.04)] rounded-3xl bg-white overflow-hidden">
                  <div className="px-6 pt-6 pb-2">
                    <h3 className="text-sm font-bold text-[#121c28] flex items-center gap-2">
                      <HugeiconsIcon icon={Invoice03Icon} size={16} strokeWidth={1.5} className="text-[#0037b0]" />
                      Invoice Billing Volume by Status
                    </h3>
                  </div>
                  <CardContent className="px-6 pb-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(dashboardData.invoices).map(([status, info]) => (
                        <div
                          key={status}
                          className="p-4 bg-[#f8f9ff] rounded-2xl flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between">
                            <Badge
                              variant={
                                status === 'PAID' ? 'success' :
                                status === 'OVERDUE' ? 'destructive' :
                                status === 'DRAFT' ? 'secondary' :
                                'default'
                              }
                              className="text-[9px] px-1.5 py-0"
                            >
                              {status.replace('_', ' ')}
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-400">
                              {info.count} count
                            </span>
                          </div>
                          <p className="text-lg font-bold text-[#121c28] mt-3">
                            {formatCurrency(info.total)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Edit Organization Modal */}
      {editingOrgId && (
        <EditOrgModal orgId={editingOrgId} onClose={() => setEditingOrgId(null)} />
      )}
    </div>
  )
}

function EditOrgModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data: org, isLoading } = useQuery({
    queryKey: ['platform', 'organization', orgId],
    queryFn: () => platformApi.getOrganizationDetails(orgId),
  })

  if (isLoading || !org) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white rounded-3xl p-8 flex items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0037b0] border-t-transparent" />
            <p className="text-xs text-slate-500 font-semibold">Loading organization details...</p>
          </div>
        </div>
      </div>
    )
  }

  return <EditOrgModalForm org={org} onClose={onClose} />
}

interface EditOrgModalFormProps {
  org: PlatformOrganizationDetails
  onClose: () => void
}

function EditOrgModalForm({ org, onClose }: EditOrgModalFormProps) {
  const queryClient = useQueryClient()
  const [planTier, setPlanTier] = useState<string>(org.planTier)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>(org.subscriptionStatus)
  const [isGrandfathered, setIsGrandfathered] = useState<boolean>(org.isGrandfathered)
  const [platformFeePercent, setPlatformFeePercent] = useState<number>(org.platformFeePercent)

  const updateMutation = useMutation({
    mutationFn: (data: {
      planTier?: string
      subscriptionStatus?: string
      isGrandfathered?: boolean
      platformFeePercent?: number
    }) => platformApi.updateOrganization(org.id, data),
    onSuccess: () => {
      toast.success('Organization config updated successfully')
      queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] })
      queryClient.invalidateQueries({ queryKey: ['platform', 'dashboard'] })
      onClose()
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update organization config')
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      planTier,
      subscriptionStatus,
      isGrandfathered,
      platformFeePercent: Number(platformFeePercent),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-[0px_12px_32px_rgba(0,55,176,0.12)] p-6 z-50 my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#121c28]">Configure Tenant</h3>
            <p className="text-[11px] text-[#434655]">{org.name} ({org.slug})</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#434655] hover:bg-[#eef4ff] hover:text-[#0037b0] transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center">
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 scrollbar-none">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#f8f9ff] p-4 rounded-2xl">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total GMV</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(org.totalGmv)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Received Payments</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(org.totalPayments)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Invoices</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{org.invoiceCount}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Users</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{org.userCount}</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="planTier" className="text-[11px] font-bold text-[#434655] uppercase tracking-wider">Plan Tier</Label>
                <FilterSelect
                  id="planTier"
                  value={planTier}
                  onChange={(val) => setPlanTier(val)}
                  options={[
                    { value: 'FREE', label: 'Free' },
                    { value: 'STARTER', label: 'Starter' },
                    { value: 'PRO', label: 'Pro' },
                    { value: 'BUSINESS', label: 'Business' },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subscriptionStatus" className="text-[11px] font-bold text-[#434655] uppercase tracking-wider">Subscription Status</Label>
                <FilterSelect
                  id="subscriptionStatus"
                  value={subscriptionStatus}
                  onChange={(val) => setSubscriptionStatus(val)}
                  options={[
                    { value: 'TRIALING', label: 'Trialing' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'PAST_DUE', label: 'Past Due' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                    { value: 'EXPIRED', label: 'Expired' },
                  ]}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="platformFeePercent" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Platform Fee %</Label>
                <div className="relative">
                  <Input
                    id="platformFeePercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={platformFeePercent}
                    onChange={(e) => setPlatformFeePercent(Number(e.target.value))}
                    className="pr-10"
                  />
                  <HugeiconsIcon icon={PercentCircleIcon} size={16} strokeWidth={1.5} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#c4c5d7]" />
                </div>
              </div>

              <div className="flex items-center justify-between sm:pt-6">
                <div className="space-y-0.5">
                  <Label htmlFor="isGrandfathered" className="text-xs font-bold text-slate-700">Grandfathered Status</Label>
                  <p className="text-[10px] text-slate-400">Exempt from standard pricing logic</p>
                </div>
                <input
                  id="isGrandfathered"
                  type="checkbox"
                  checked={isGrandfathered}
                  onChange={(e) => setIsGrandfathered(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary/20 accent-[#0037b0] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateMutation.isPending}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-650 min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0037b0] to-[#1d4ed8] text-white text-xs font-bold shadow-md shadow-[#0037b0]/20 min-h-[44px]"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </form>

          {/* User List */}
          <div className="space-y-2 pt-2">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Associated Users</h4>
            <div className="bg-[#f8f9ff] rounded-2xl overflow-hidden p-2">
              {org.users.length > 0 ? (
                <div className="space-y-2">
                  {org.users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between bg-white p-3 rounded-xl shadow-[0px_4px_12px_rgba(0,55,176,0.01)]">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] px-2 py-0.5">
                          {u.role}
                        </Badge>
                        <Badge
                          variant={u.isActive ? 'success' : 'destructive'}
                          className="text-[9px] px-2 py-0.5"
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 py-4">No users found</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
