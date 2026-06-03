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
  Lock
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { TrialBanner } from '../shared/TrialBanner'
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
    { name: 'Inventory', href: '/inventory', icon: Package, requiresPlan: 'PRO' as PlanTier },
    { name: 'Services', href: '/settings/services', icon: Wrench },
    { name: 'Reports', href: '/reports', icon: BarChart3, requiresPlan: 'PRO' as PlanTier, visible: canViewReports },
    { name: 'Tax', href: '/tax', icon: BookOpen, requiresPlan: 'PRO' as PlanTier, visible: user?.role !== 'STAFF' },
    { name: 'Settings', href: '/settings', icon: Settings, visible: isAdmin },
  ].filter((item) => item.visible !== false) as Array<{ name: string; href: string; icon: any; requiresPlan?: PlanTier; visible?: boolean }>

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex flex-1 flex-col overflow-hidden relative">
        {/* Mobile header with brand mark */}
        <div className="flex h-16 items-center justify-between bg-[#f8f9ff]/80 backdrop-blur-md px-6 lg:hidden border-b border-[#eef4ff]/50 z-30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] flex items-center justify-center font-bold text-white text-xs shadow-md shadow-[#0037b0]/20">
              K
            </div>
            <span className="text-lg font-bold tracking-tighter text-slate-900">Kulode</span>
          </div>
        </div>

        <TrialBanner />

        <div className="flex-1 overflow-hidden pb-28 lg:pb-0 flex flex-col">
          <Outlet />
        </div>

        {/* Floating Mobile Bottom Navigation Dock */}
        <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md lg:hidden">
          <div className="bg-white/80 backdrop-blur-lg border border-slate-200/40 rounded-full px-2 py-1.5 shadow-[0_12px_32px_rgba(0,55,176,0.08)] flex justify-between items-center">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 flex-1 py-2 px-1.5 rounded-full transition-all duration-200 select-none ${
                    isActive 
                      ? 'bg-[#0037b0]/8 text-[#0037b0] font-bold scale-105 shadow-[0px_4px_12px_rgba(0,55,176,0.04)]' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <item.icon className="h-4.5 w-4.5" strokeWidth={1.5} />
                  <span className="text-[9px] tracking-tight font-medium">{item.name}</span>
                </Link>
              )
            })}

            {/* More Button */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex flex-col items-center gap-1 flex-1 py-2 px-1.5 rounded-full transition-all duration-200 select-none cursor-pointer ${
                moreOpen 
                  ? 'bg-[#0037b0]/8 text-[#0037b0] font-bold scale-105 shadow-[0px_4px_12px_rgba(0,55,176,0.04)]' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <MoreHorizontal className="h-4.5 w-4.5" strokeWidth={1.5} />
              <span className="text-[9px] tracking-tight font-medium">More</span>
            </button>
          </div>
        </div>

        {/* More Options Drawer Overlay */}
        {moreOpen && (
          <>
            <div 
              className="fixed inset-0 z-45 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
              onClick={() => setMoreOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,55,176,0.06)] px-6 pt-6 pb-8 lg:hidden max-h-[85vh] overflow-y-auto border-t border-slate-100/50 animate-in slide-in-from-bottom duration-300">
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
                  href="mailto:abubakar.sambo@kulode.app"
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
