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
  Crown,
  LucideIcon
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { WelcomeStepper } from '@/components/WelcomeStepper'
import { TrialBanner } from '../shared/TrialBanner'
import { RebrandBanner } from '../shared/RebrandBanner'
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
  const { hasRequiredPlan, isExpired } = useSubscription()

  const isBillingPage = location.pathname.startsWith('/settings/billing')
  const showExpiredGate = isExpired && !isBillingPage

  if (showExpiredGate) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#090d16] text-white p-6">
        <div className="relative w-full max-w-md bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 shadow-[0_24px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive">
            <Lock className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">Subscription Expired</h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed font-sans">
            Your TariOne trial or subscription has expired. Don't worry—your invoicing data, client records, and transaction histories are completely safe.
          </p>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed font-sans">
            Please choose a subscription plan to unlock access to your account and continue managing your business.
          </p>
          
          <div className="mt-8 space-y-3">
            <Link
              to="/settings/billing"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#2563eb] px-6 py-3.5 text-sm font-semibold text-white hover:from-primary/90 hover:to-[#2563eb]/90 active:scale-[0.98] transition-all duration-150 shadow-[0_4px_12px_rgba(0,55,176,0.3)] cursor-pointer font-sans"
            >
              <Crown className="h-5 w-5" />
              Subscribe & Unlock Account
            </Link>
            <button
              onClick={() => logout()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-6 py-3 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 hover:border-slate-700 transition-colors cursor-pointer font-sans"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </div>
      </div>
    )
  }

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
            <div className="bg-white/95 backdrop-blur-lg border border-[#eef4ff] rounded-full px-2 py-1.5 shadow-[0_16px_40px_rgba(0,55,176,0.12)] flex justify-between items-center">
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
                      : "text-[#434655] hover:text-slate-900"
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
                  : "text-[#434655] hover:text-slate-900"
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
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,55,176,0.06)] px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:hidden max-h-[85vh] overflow-y-auto border-t border-slate-100/50 animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-400">All Operations</span>
                <button 
                  onClick={() => setMoreOpen(false)} 
                  className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition-colors"
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
                        "flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 gap-2 border border-slate-50",
                        isActive 
                          ? "bg-[#0037b0]/5 text-[#0037b0] font-bold border-[#0037b0]/10 shadow-[0_4px_12px_rgba(0,55,176,0.02)]" 
                          : "bg-slate-50 hover:bg-slate-100 text-slate-700"
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
              <div className="border-t border-slate-100 pt-6 pb-4 space-y-3">
                <div className="flex items-center gap-3 px-2 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-xs font-bold text-white shadow-md shadow-[#0037b0]/25">
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {user?.organizationName}
                    </p>
                  </div>
                </div>

                <a
                  href="mailto:abubakar.sambo@tarione.com"
                  onClick={() => setMoreOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <LifeBuoy className="h-5 w-5" strokeWidth={1.5} />
                  Contact Support
                </a>
                <button
                  onClick={() => {
                    setMoreOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
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
