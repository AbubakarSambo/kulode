import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  MoreHorizontal,
  X,
  ChefHat,
  Clock,
  Tag,
  UserRound,
  ShoppingCart,
  Receipt,
} from 'lucide-react'
import {
  DashboardIcon,
  ClientsIcon,
  InvoicesIcon,
  PaymentsIcon,
  VendorsIcon,
  ExpensesIcon,
  InventoryIcon,
  ServicesIcon,
  ReportsIcon,
  AiChatIcon,
  TaxIcon,
  SettingsIcon,
  SupportIcon,
  LogoutIcon,
  ShieldIcon,
  LockIcon,
} from '@/components/ui/CustomIcons'
import { Sidebar } from './Sidebar'
import { WelcomeStepper } from '@/components/WelcomeStepper'
import { TrialBanner } from '../shared/TrialBanner'
import { SubscriptionExpiredBanner } from '../shared/SubscriptionExpiredBanner'
import { OfflineQueueBanner } from '../pos/OfflineQueueBanner'
import { useAuthStore } from '@/stores/auth'
import { useLogout, useSwitchUser } from '@/hooks'
import { useSubscription } from '@/hooks/useSubscription'
import { useOrgModules } from '@/hooks/useOrgModules'
import { cn } from '@/lib/utils'
import { PIN_ELIGIBLE_ROLES } from '@/lib/pin'
import type { PlanTier } from '@/types'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const switchUser = useSwitchUser()
  const isPinEligible = !!user && PIN_ELIGIBLE_ROLES.includes(user.role)
  const { hasRequiredPlan } = useSubscription()
  const { hasPos, hasInvoicing } = useOrgModules()



  const getPageTitle = () => {
    const path = location.pathname
    if (path.startsWith('/dashboard')) return 'Overview'
    if (path.startsWith('/pos/dashboard')) return 'Dashboard'
    if (path.startsWith('/clients')) return 'Clients'
    if (path.startsWith('/invoices')) return 'Invoices'
    if (path.startsWith('/payments')) return 'Payments'
    if (path.startsWith('/vendors')) return 'Vendors'
    if (path.startsWith('/expenses')) return 'Expenses'
    if (path.startsWith('/inventory')) return 'Product Inventory'
    if (path.startsWith('/pos/orders')) return 'Orders'
    if (path.startsWith('/pos/customers')) return 'Customers'
    if (path.startsWith('/pos/menu')) return 'Menu'
    if (path.startsWith('/pos/categories')) return 'Categories'
    if (path.startsWith('/pos/waiters')) return 'Waiters'
    if (path.startsWith('/pos/shift')) return 'Shift'
    if (path.startsWith('/pos/order')) return 'Order'
    if (path.startsWith('/reports')) return 'Reports'
    if (path.startsWith('/tax')) return 'Tax'
    if (path.startsWith('/settings')) return 'Settings'
    return ''
  }

  const isWaiter = user?.role === 'WAITER'
  // Waiters only handle selling, order tracking, and customer lookup
  const WAITER_ALLOWED_HREFS = ['/pos/order/new', '/pos/orders', '/pos/customers']

  const navItems = isWaiter
    ? [
        { name: 'Sell', href: '/pos/order/new', icon: ShoppingCart },
        { name: 'Orders', href: '/pos/orders', icon: Receipt },
      ]
    : hasInvoicing
    ? [
        { name: 'Overview', href: '/dashboard', icon: DashboardIcon },
        { name: 'Clients', href: '/clients', icon: ClientsIcon },
        { name: 'Invoices', href: '/invoices', icon: InvoicesIcon },
        { name: 'Payments', href: '/payments', icon: PaymentsIcon },
      ]
    : [
        { name: 'Dashboard', href: '/pos/dashboard', icon: DashboardIcon },
        { name: 'Sell', href: '/pos/order/new', icon: ShoppingCart },
        { name: 'Orders', href: '/pos/orders', icon: Receipt },
      ]

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const canViewReports = isAdmin || user?.role === 'ACCOUNTANT'

  type MoreItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; requiresPlan?: PlanTier; visible?: boolean }

  const moreGroups: Array<{ label: string; items: MoreItem[] }> = [
    {
      label: 'Money',
      items: [
        { name: 'Expenses', href: '/expenses', icon: ExpensesIcon, requiresPlan: 'PRO' as PlanTier, visible: hasInvoicing && user?.role !== 'STAFF' },
        { name: 'Vendors', href: '/vendors', icon: VendorsIcon, requiresPlan: 'PRO' as PlanTier, visible: hasInvoicing && user?.role !== 'STAFF' },
        { name: 'Tax', href: '/tax', icon: TaxIcon, requiresPlan: 'PRO' as PlanTier, visible: hasInvoicing && user?.role !== 'STAFF' },
      ] as MoreItem[],
    },
    {
      label: 'Catalog',
      items: [
        { name: 'Product Inventory', href: '/inventory', icon: InventoryIcon, requiresPlan: 'PRO' as PlanTier, visible: hasInvoicing },
        { name: 'Services', href: '/settings/services', icon: ServicesIcon, visible: hasInvoicing },
      ] as MoreItem[],
    },
    {
      label: 'Restaurant POS',
      items: [
        { name: 'Menu', href: '/pos/menu', icon: ChefHat, visible: hasPos },
        { name: 'Categories', href: '/pos/categories', icon: Tag, visible: hasPos },
        { name: 'Waiters', href: '/pos/waiters', icon: UserRound, visible: hasPos },
        { name: 'Shift', href: '/pos/shift', icon: Clock, visible: hasPos },
        { name: 'Customers', href: '/pos/customers', icon: UserRound, visible: hasPos },
      ] as MoreItem[],
    },
    {
      label: 'Insights',
      items: [
        { name: 'Reports', href: '/reports', icon: ReportsIcon, requiresPlan: 'PRO' as PlanTier, visible: canViewReports && hasInvoicing },
        { name: 'AI Chat', href: '/ai-chat', icon: AiChatIcon, requiresPlan: 'PRO' as PlanTier, visible: canViewReports && hasInvoicing },
      ] as MoreItem[],
    },
    {
      label: 'Account',
      items: [
        { name: 'Settings', href: '/settings', icon: SettingsIcon, visible: isAdmin },
        { name: 'Billing & Plans', href: '/settings/billing', icon: PaymentsIcon, visible: isAdmin },
      ] as MoreItem[],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        isWaiter ? WAITER_ALLOWED_HREFS.includes(item.href) : item.visible !== false,
      ),
    }))
    .filter((group) => group.items.length > 0)

  const isHideMobileNav = location.pathname.includes('/new') || 
    (location.pathname.startsWith('/invoices/') && location.pathname !== '/invoices') ||
    (location.pathname.startsWith('/clients/') && location.pathname !== '/clients') ||
    (location.pathname.startsWith('/vendors/') && location.pathname !== '/vendors')

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <WelcomeStepper />

      <main className="flex flex-1 flex-col overflow-hidden relative">
        <SubscriptionExpiredBanner />
        {/* Mobile header with brand mark (with top notch safe-area support) */}
        <div className="flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] items-center justify-between bg-background/80 backdrop-blur-md px-6 lg:hidden border-b border-[#eef4ff]/50 z-30">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Tari1 Logo" className="w-7 h-7 object-contain" />
            <span className="text-base font-bold tracking-tight text-slate-900">
              {getPageTitle() ? getPageTitle() : 'Tari1'}
            </span>
          </div>
        </div>

        <TrialBanner />
        <OfflineQueueBanner />

        <div className={cn("flex-1 overflow-hidden flex flex-col", isHideMobileNav ? "pb-0" : "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0")}>
          <Outlet />
        </div>

        {/* Floating Mobile Bottom Navigation Dock */}
        {!isHideMobileNav && (
          <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md lg:hidden">
            <div className="bg-card/95 backdrop-blur-lg border border-border rounded-full px-2 py-1.5 shadow-[0_16px_40px_rgba(0,55,176,0.12)] flex justify-between items-center">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.href)
                return (
                  <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1 flex-1 py-2 px-1.5 rounded-full transition-all duration-200 select-none",
                    isActive 
                      ? "bg-[#0037b0]/10 text-[#0037b0] font-extrabold shadow-[0px_4px_12px_rgba(0,55,176,0.02)]" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  <span className="text-[9px] tracking-tight font-semibold">{item.name}</span>
                </Link>
              )
            })}

            {/* More Button */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 py-2 px-1.5 rounded-full transition-all duration-200 select-none cursor-pointer",
                moreOpen 
                  ? "bg-[#0037b0]/10 text-[#0037b0] font-extrabold shadow-[0px_4px_12px_rgba(0,55,176,0.02)]" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-4.5 w-4.5" strokeWidth={moreOpen ? 2 : 1.5} />
              <span className="text-[9px] tracking-tight font-semibold">More</span>
            </button>
          </div>
        </div>
      )}

        {/* More Options Drawer Overlay */}
        {moreOpen && (
          <>
            <div 
              className="fixed inset-0 z-45 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
              onClick={() => setMoreOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,55,176,0.06)] px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] lg:hidden max-h-[85vh] overflow-y-auto border-t border-border animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-400">All Operations</span>
                <button 
                  onClick={() => setMoreOpen(false)} 
                  className="rounded-full bg-muted p-2 text-muted-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Grouped operations */}
              <div className="space-y-6 mb-8">
                {moreGroups.map((group) => (
                  <div key={group.label}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">
                      {group.label}
                    </span>
                    <div className="grid grid-cols-3 gap-4">
                      {group.items.map((item) => {
                        const isActive = location.pathname.startsWith(item.href)
                        const isLocked = item.requiresPlan && !hasRequiredPlan(item.requiresPlan)
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              "flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 gap-2 border border-border/40",
                              isActive
                                ? "bg-[#0037b0]/5 text-[#0037b0] font-bold border-[#0037b0]/10 shadow-[0_4px_12px_rgba(0,55,176,0.02)]"
                                : "bg-muted hover:bg-accent text-foreground"
                            )}
                          >
                            <div className="relative">
                              <item.icon className="h-6 w-6 shrink-0" />
                              {isLocked && (
                                <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-sm">
                                  <LockIcon className="h-2 w-2" />
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-center truncate w-full">{item.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Account, Support & Logout section */}
              <div className="border-t border-border pt-6 pb-4 space-y-3">
                <div className="flex items-center gap-3 px-2 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-xs font-bold text-white shadow-md shadow-[#0037b0]/25">
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-bold text-foreground">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.organizationName}
                    </p>
                  </div>
                </div>

                {user?.isPlatformAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMoreOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#0037b0] bg-[#0037b0]/5 hover:bg-[#0037b0]/10 transition-colors border border-[#0037b0]/10"
                  >
                    <ShieldIcon className="h-5 w-5" />
                    Platform Admin
                  </Link>
                )}

                <a
                  href="mailto:abubakar.sambo@tarione.com"
                  onClick={() => setMoreOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground bg-muted hover:bg-accent transition-colors"
                >
                  <SupportIcon className="h-5 w-5" />
                  Contact Support
                </a>
                {!isPinEligible && (
                  <button
                    onClick={() => {
                      setMoreOpen(false)
                      switchUser()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground bg-muted hover:bg-accent transition-colors cursor-pointer"
                  >
                    <LogoutIcon className="h-5 w-5" />
                    Switch User
                  </button>
                )}
                <button
                  onClick={() => {
                    setMoreOpen(false)
                    if (isPinEligible) {
                      switchUser()
                    } else {
                      logout()
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
                >
                  <LogoutIcon className="h-5 w-5" />
                  {isPinEligible ? 'Switch User' : 'Logout'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
