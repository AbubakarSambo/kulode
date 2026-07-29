import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, CreditCard, UtensilsCrossed, ChefHat, Clock, Receipt, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useLogout } from '@/hooks'
import { Logo } from '@/components/shared'
import { useSubscription } from '@/hooks/useSubscription'
import type { PlanTier } from '@/types'
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

const navigationGroups = [
  {
    title: 'Core Platform',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: DashboardIcon, requiresPlan: 'PRO' as PlanTier },
      { name: 'Clients', href: '/clients', icon: ClientsIcon },
    ]
  },
  {
    title: 'Finance & Sales',
    items: [
      { name: 'Invoices', href: '/invoices', icon: InvoicesIcon },
      { name: 'Payments', href: '/payments', icon: PaymentsIcon },
      { name: 'Expenses', href: '/expenses', icon: ExpensesIcon, requiresPlan: 'PRO' as PlanTier },
    ]
  },
  {
    title: 'Business Ops',
    items: [
      { name: 'Vendors', href: '/vendors', icon: VendorsIcon, requiresPlan: 'PRO' as PlanTier },
      { name: 'Product Inventory', href: '/inventory', icon: InventoryIcon, requiresPlan: 'PRO' as PlanTier },
      { name: 'Services', href: '/settings/services', icon: ServicesIcon },
    ]
  },
  {
    title: 'Restaurant POS',
    items: [
      { name: 'Tables', href: '/pos/tables', icon: UtensilsCrossed, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Menu', href: '/pos/menu', icon: ChefHat, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Shift', href: '/pos/shift', icon: Clock, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Orders', href: '/pos/orders', icon: Receipt, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Customers', href: '/pos/customers', icon: Users, requiresPlan: undefined as PlanTier | undefined },
    ]
  },
  {
    title: 'Analytics & Reporting',
    items: [
      { name: 'Reports', href: '/reports', icon: ReportsIcon, requiresPlan: 'PRO' as PlanTier },
      { name: 'AI Chat', href: '/ai-chat', icon: AiChatIcon, requiresPlan: 'PRO' as PlanTier },
    ]
  },
  {
    title: 'Compliance & Tax',
    items: [
      { name: 'Tax', href: '/tax', icon: TaxIcon, requiresPlan: 'PRO' as PlanTier },
    ]
  }
]

const adminNavigation = [
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
  { name: 'Billing & Plans', href: '/settings/billing', icon: CreditCard },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const { hasRequiredPlan } = useSubscription()

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })

  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const canViewReports = isAdmin || user?.role === 'ACCOUNTANT'

  // Filter groups and items
  const filteredNavGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if ((item.href === '/reports' || item.href === '/ai-chat') && !canViewReports) return false
        if (
          (item.href === '/payments' ||
            item.href === '/expenses' ||
            item.href === '/vendors' ||
            item.href === '/tax') &&
          user?.role === 'STAFF'
        )
          return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  const handleNavClick = () => {
    if (onClose) onClose()
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar Container */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-dvh flex-col bg-[#fcfdff] transition-all duration-300 ease-in-out lg:static lg:h-screen lg:translate-x-0 shadow-[4px_0_24px_rgba(0,55,176,0.02)] lg:relative lg:overflow-visible overflow-x-hidden',
        isCollapsed ? 'lg:w-20 w-64' : 'lg:w-64 w-64',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Collapse toggle button - desktop only */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex absolute top-10 -right-3.5 z-55 h-7 w-7 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-500 shadow-md hover:text-slate-800 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />}
        </button>

        {/* Logo Section */}
        <div className={cn(
          "flex h-20 items-center justify-between px-6 transition-all duration-200 shrink-0",
          isCollapsed && "lg:px-0 lg:justify-center"
        )}>
          <div className="flex items-center gap-3">
            {isCollapsed ? (
              <img src="/favicon.svg" alt="Tari1 Logo" className="w-8 h-8 object-contain shrink-0" />
            ) : (
              <Logo className="h-10 w-auto object-contain shrink-0" />
            )}
          </div>
          {/* Close button - mobile only */}
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-2 select-none scrollbar-none">
          {filteredNavGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isLocked = item.requiresPlan && !hasRequiredPlan(item.requiresPlan)
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3.5 py-2.5 min-h-[40px] text-sm font-medium transition-all duration-200 relative group rounded-xl',
                          isActive
                            ? 'bg-[#0037b0]/[0.08] text-[#0037b0] font-bold'
                            : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800',
                          isCollapsed && 'lg:px-0 lg:justify-center'
                        )
                      }
                    >
                      {/* Active left dot indicator */}
                      <span className={cn(
                        'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-[#0037b0] transition-all duration-200',
                        'opacity-0 group-[.active]:opacity-100'
                      )} aria-hidden="true" />
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className={cn(
                        "flex-1 truncate transition-all duration-200",
                        isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                      )}>{item.name}</span>
                      {isLocked && !isCollapsed && <LockIcon className="h-3.5 w-3.5 opacity-40 ml-2" />}

                      {/* Tooltip for collapsed state */}
                      {isCollapsed && (
                        <div className="hidden lg:group-hover:block absolute left-20 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                          {item.name}
                          {isLocked && ' (Pro)'}
                        </div>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Admin Group */}
          {isAdmin && (
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">
                  Configuration
                </div>
              )}
              <div className="space-y-0.5">
                {adminNavigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    end
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3.5 py-2.5 min-h-[40px] text-sm font-medium transition-all duration-200 relative group rounded-xl',
                        isActive
                          ? 'bg-[#0037b0]/[0.08] text-[#0037b0] font-bold'
                          : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800',
                        isCollapsed && 'lg:px-0 lg:justify-center'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className={cn(
                      "flex-1 truncate transition-all duration-200",
                      isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                    )}>{item.name}</span>

                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <div className="hidden lg:group-hover:block absolute left-20 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                        {item.name}
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* Platform Group */}
          {user?.isPlatformAdmin && (
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400/80 select-none">
                  Platform
                </div>
              )}
              <div className="space-y-0.5">
                <NavLink
                  to="/admin"
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3.5 py-2.5 min-h-[40px] text-sm font-medium transition-all duration-200 relative group rounded-xl',
                      isActive
                        ? 'bg-[#0037b0]/[0.08] text-[#0037b0] font-bold'
                        : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800',
                      isCollapsed && 'lg:px-0 lg:justify-center'
                    )
                  }
                >
                  <ShieldIcon className="h-5 w-5 shrink-0" />
                  <span className={cn(
                    "flex-1 truncate transition-all duration-200",
                    isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                  )}>Platform Admin</span>

                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="hidden lg:group-hover:block absolute left-20 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                      Platform Admin
                    </div>
                  )}
                </NavLink>
              </div>
            </div>
          )}
        </nav>

        {/* User profile / support section at bottom */}
        <div className="p-4 mt-auto space-y-2 shrink-0 border-t border-slate-100/50 pt-4">

          <div className={cn(
            "rounded-2xl border border-[#0037b0]/8 bg-[#0037b0]/[0.02] p-3 transition-all duration-200 hover:bg-[#0037b0]/[0.05]",
            isCollapsed && "lg:p-1.5"
          )}>
            <div className={cn(
              "flex items-center gap-3 transition-all duration-200 relative group",
              isCollapsed && "lg:justify-center"
            )}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-xs font-bold text-white shadow-md shadow-[#0037b0]/25 shrink-0 select-none">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
              <div className={cn(
                "flex-1 overflow-hidden transition-all duration-200",
                isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>
                <p className="truncate text-sm font-bold text-slate-800">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[10px] font-semibold text-slate-400 mt-0.5">
                  {user?.organizationName}
                </p>
              </div>

              {/* Tooltip for user profile when collapsed */}
              {isCollapsed && (
                <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                  {user?.firstName} {user?.lastName} ({user?.organizationName})
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-0.5">
            <a
              href="mailto:abubakar.sambo@tarione.com"
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-[#eef4ff]/60 hover:text-slate-950 transition-colors relative group",
                isCollapsed && "lg:justify-center lg:px-0"
              )}
            >
              <SupportIcon className="h-4.5 w-4.5 shrink-0" />
              <span className={cn(
                "transition-all duration-200",
                isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>Contact Support</span>
              {isCollapsed && (
                <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                  Contact Support
                </div>
              )}
            </a>
            
            <button
              onClick={() => {
                logout()
                if (onClose) onClose()
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-[#eef4ff]/60 hover:text-slate-950 transition-colors relative group cursor-pointer",
                isCollapsed && "lg:justify-center lg:px-0"
              )}
            >
              <LogoutIcon className="h-4.5 w-4.5 shrink-0" />
              <span className={cn(
                "transition-all duration-200",
                isCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>Logout</span>
              {isCollapsed && (
                <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                  Logout
                </div>
              )}
            </button>
          </div>

          {/* Subtle version code label */}
          <div className={cn(
            "pt-2 px-2.5 flex items-center justify-between border-t border-slate-200/20 select-none mt-2",
            isCollapsed && "lg:justify-center lg:px-0 lg:border-0 lg:pt-1"
          )}>
            <span className="text-[9px] font-bold text-slate-400">
              {isCollapsed ? `v${__APP_VERSION__}` : `Tari v${__APP_VERSION__}`}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
