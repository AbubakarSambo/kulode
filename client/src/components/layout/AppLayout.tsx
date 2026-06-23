import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  CreditCard,
  MoreHorizontal,
  Store,
  Receipt,
  Package,
  Wrench,
  BarChart3,
  BookOpen,
  Settings,
  LifeBuoy,
  LogOut,
  X,
  Lock,
  LucideIcon
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { WelcomeStepper } from '@/components/WelcomeStepper'
import { TrialBanner } from '../shared/TrialBanner'
import { RebrandBanner } from '../shared/RebrandBanner'
import { SubscriptionExpiredBanner } from '../shared/SubscriptionExpiredBanner'
import { useAuthStore } from '@/stores/auth'
import { useLogout } from '@/hooks'
import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'
import type { PlanTier } from '@/types'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const { hasRequiredPlan } = useSubscription()



  const getPageTitle = () => {
    const path = location.pathname
    if (path.startsWith('/dashboard')) return 'Overview'
    if (path.startsWith('/clients')) return 'Clients'
    if (path.startsWith('/invoices')) return 'Invoices'
    if (path.startsWith('/payments')) return 'Payments'
    if (path.startsWith('/vendors')) return 'Vendors'
    if (path.startsWith('/expenses')) return 'Expenses'
    if (path.startsWith('/inventory')) return 'Product Inventory'
    if (path.startsWith('/reports')) return 'Reports'
    if (path.startsWith('/tax')) return 'Tax'
    if (path.startsWith('/settings')) return 'Settings'
    return ''
  }

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Payments', href: '/payments', icon: CreditCard },
  ]

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const canViewReports = isAdmin || user?.role === 'ACCOUNTANT'

  const moreItems = [
    { name: 'Vendors', href: '/vendors', icon: Store, requiresPlan: 'PRO' as PlanTier, visible: user?.role !== 'STAFF' },
    { name: 'Expenses', href: '/expenses', icon: Receipt, requiresPlan: 'PRO' as PlanTier, visible: user?.role !== 'STAFF' },
    { name: 'Product Inventory', href: '/inventory', icon: Package, requiresPlan: 'PRO' as PlanTier },
    { name: 'Services', href: '/settings/services', icon: Wrench },
    { name: 'Reports', href: '/reports', icon: BarChart3, requiresPlan: 'PRO' as PlanTier, visible: canViewReports },
    { name: 'Tax', href: '/tax', icon: BookOpen, requiresPlan: 'PRO' as PlanTier, visible: user?.role !== 'STAFF' },
    { name: 'Settings', href: '/settings', icon: Settings, visible: isAdmin },
    { name: 'Billing & Plans', href: '/settings/billing', icon: CreditCard, visible: isAdmin },
  ].filter((item) => item.visible !== false) as Array<{ name: string; href: string; icon: LucideIcon; requiresPlan?: PlanTier; visible?: boolean }>

  const isHideMobileNav = location.pathname.includes('/new') || 
    (location.pathname.startsWith('/invoices/') && location.pathname !== '/invoices') ||
    (location.pathname.startsWith('/clients/') && location.pathname !== '/clients') ||
    (location.pathname.startsWith('/vendors/') && location.pathname !== '/vendors')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <WelcomeStepper />

      <main className="flex flex-1 flex-col overflow-hidden relative">
        <SubscriptionExpiredBanner />
        <RebrandBanner />
        {/* Mobile header with brand mark (with top notch safe-area support) */}
        <div className="flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] items-center justify-between bg-background/80 backdrop-blur-md px-6 lg:hidden border-b border-[#eef4ff]/50 z-30">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Tari1 Logo" className="w-7 h-7 object-contain" />
            <span className="text-base font-bold tracking-tight text-slate-900">
              {getPageTitle() ? getPageTitle() : 'Tari1'}
            </span>
          </div>
        </div>

        {location.pathname.startsWith('/payments') && <TrialBanner />}

        <div className={cn("flex-1 overflow-hidden flex flex-col", isHideMobileNav ? "pb-0" : "pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:pb-0")}>
          <Outlet />
        </div>

        {/* Floating Mobile Bottom Navigation Dock */}
        {!isHideMobileNav && (
          <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md lg:hidden">
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
                  <item.icon className="h-4.5 w-4.5" strokeWidth={isActive ? 2 : 1.5} />
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
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,55,176,0.06)] px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:hidden max-h-[85vh] overflow-y-auto border-t border-border animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-400">All Operations</span>
                <button 
                  onClick={() => setMoreOpen(false)} 
                  className="rounded-full bg-muted p-2 text-muted-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Grid of operations */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {moreItems.map((item) => {
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
                        <item.icon className="h-6 w-6" strokeWidth={1.5} />
                        {isLocked && (
                          <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-sm">
                            <Lock className="h-2 w-2" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-center truncate w-full">{item.name}</span>
                    </Link>
                  )
                })}
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

                <a
                  href="mailto:abubakar.sambo@tarione.com"
                  onClick={() => setMoreOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground bg-muted hover:bg-accent transition-colors"
                >
                  <LifeBuoy className="h-5 w-5" strokeWidth={1.5} />
                  Contact Support
                </a>
                <button
                  onClick={() => {
                    setMoreOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                >
                  <LogOut className="h-5 w-5" strokeWidth={1.5} />
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
