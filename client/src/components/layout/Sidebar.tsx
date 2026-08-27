import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, CreditCard, ChefHat, Clock, Receipt, Users, ShoppingCart, Tag, UserRound, Timer, UserCog, RefreshCw, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useLogout, useSwitchUser } from '@/hooks'
import { isPinEligible } from '@/lib/pin'
import { Logo } from '@/components/shared'
import { useSubscription } from '@/hooks/useSubscription'
import { useOrgModules } from '@/hooks/useOrgModules'
import type { PlanTier, UserRole } from '@/types'
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
      { name: 'Dashboard', href: '/pos/dashboard', icon: DashboardIcon, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Sell', href: '/pos/order/new', icon: ShoppingCart, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Tables', href: '/pos/tables', icon: LayoutGrid, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Menu', href: '/pos/menu', icon: ChefHat, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Categories', href: '/pos/categories', icon: Tag, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Shift', href: '/pos/shift', icon: Clock, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Orders', href: '/pos/orders', icon: Receipt, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Customers', href: '/pos/customers', icon: Users, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Waiters', href: '/pos/waiters', icon: UserRound, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Kitchen', href: '/pos/kitchen', icon: Timer, requiresPlan: undefined as PlanTier | undefined },
      { name: 'Reports', href: '/pos/reports', icon: ReportsIcon, requiresPlan: undefined as PlanTier | undefined },
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
  { name: 'Users', href: '/settings/users', icon: UserCog },
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
  const switchUser = useSwitchUser()
  const userIsPinEligible = !!user && isPinEligible(user.roles)
  const { hasRequiredPlan } = useSubscription()
  const { hasPos, hasInvoicing } = useOrgModules()

  const [collapsedPref, setCollapsedPref] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebar-collapsed')
      return stored === null ? true : stored === 'true'
    }
    return true
  })
  const [isHovering, setIsHovering] = useState(false)
  const effectiveCollapsed = collapsedPref && !isHovering

  const toggleCollapse = () => {
    const newState = !collapsedPref
    setCollapsedPref(newState)
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

  const userRoles = user?.roles ?? []
  const isAdmin = userRoles.includes('SUPER_ADMIN') || userRoles.includes('ADMIN')
  const canViewReports = isAdmin || userRoles.includes('ACCOUNTANT')

  // Which invoicing-only nav items to hide from POS-only orgs
  const INVOICING_ONLY_HREFS = ['/clients', '/invoices', '/tax', '/reports', '/ai-chat', '/inventory', '/payments', '/dashboard', '/settings/services', '/vendors', '/expenses']

  // Waiters only handle selling, order tracking, and customer lookup
  const WAITER_ALLOWED_HREFS = ['/pos/order/new', '/pos/orders', '/pos/customers']

  // Pass/Runner are kitchen-only roles — the ticket board is the only page they can see
  const KITCHEN_ALLOWED_HREFS = ['/pos/kitchen']

  // Cashiers close out orders and take payment, and can now manage the table list — no need for
  // menu/waiter management or analytics
  const CASHIER_ALLOWED_HREFS = ['/pos/orders', '/pos/customers', '/pos/shift', '/pos/tables']

  // Supervisors get floor oversight (orders, customers, shift, kitchen) but not menu/category
  // editing or the Waiters roster — since Waiter is just a User now, managing it requires the
  // same admin-only access as the rest of user management.
  const SUPERVISOR_ALLOWED_HREFS = ['/pos/orders', '/pos/customers', '/pos/shift', '/pos/kitchen']

  // Roles that get a tight nav allowlist rather than the broader access every other role has.
  // A user with multiple roles sees the UNION of what each individually unlocks — e.g. a
  // Waiter+Pass user sees Sell/Orders/Customers AND the kitchen board. But if ANY assigned role
  // is unrestricted (not in this map), that's already a superset of these allowlists, so the
  // tight filtering is skipped entirely in favor of the normal broader rules below.
  const RESTRICTED_ROLE_HREFS: Partial<Record<UserRole, string[]>> = {
    WAITER: WAITER_ALLOWED_HREFS,
    PASS: KITCHEN_ALLOWED_HREFS,
    RUNNER: KITCHEN_ALLOWED_HREFS,
    CASHIER: CASHIER_ALLOWED_HREFS,
    SUPERVISOR: SUPERVISOR_ALLOWED_HREFS,
  }
  const hasUnrestrictedRole = userRoles.some((r) => !(r in RESTRICTED_ROLE_HREFS))
  const restrictedHrefsUnion = hasUnrestrictedRole
    ? null
    : Array.from(new Set(userRoles.flatMap((r) => RESTRICTED_ROLE_HREFS[r] ?? [])))

  // Filter groups and items
  const filteredNavGroups = navigationGroups
    .filter((group) => group.title !== 'Restaurant POS' || hasPos)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (restrictedHrefsUnion) return restrictedHrefsUnion.includes(item.href)
        if (INVOICING_ONLY_HREFS.includes(item.href) && !hasInvoicing) return false
        if ((item.href === '/reports' || item.href === '/ai-chat') && !canViewReports) return false
        if (item.href === '/pos/reports' && !isAdmin) return false
        if (
          (item.href === '/payments' ||
            item.href === '/expenses' ||
            item.href === '/vendors' ||
            item.href === '/tax') &&
          userRoles.every((r) => r === 'STAFF')
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
      <div
        onMouseEnter={() => collapsedPref && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-dvh flex-col bg-[#fcfdff] transition-all duration-300 ease-in-out lg:static lg:h-screen lg:translate-x-0 shadow-[4px_0_24px_rgba(0,55,176,0.02)] lg:relative lg:overflow-visible overflow-x-hidden',
        effectiveCollapsed ? 'lg:w-20 w-64' : 'lg:w-64 w-64',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Collapse toggle button - desktop only */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex absolute top-10 -right-3.5 z-55 h-7 w-7 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-500 shadow-md hover:text-slate-800 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          {collapsedPref ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />}
        </button>

        {/* Logo Section */}
        <div className={cn(
          "flex h-20 items-center justify-between px-6 transition-all duration-200 shrink-0",
          effectiveCollapsed && "lg:px-0 lg:justify-center"
        )}>
          <div className="flex items-center gap-3">
            {effectiveCollapsed ? (
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
              {!effectiveCollapsed && (
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
                          effectiveCollapsed && 'lg:px-0 lg:justify-center'
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
                        effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                      )}>{item.name}</span>
                      {isLocked && !effectiveCollapsed && <LockIcon className="h-3.5 w-3.5 opacity-40 ml-2" />}

                      {/* Tooltip for collapsed state */}
                      {effectiveCollapsed && (
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
              {!effectiveCollapsed && (
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
                        effectiveCollapsed && 'lg:px-0 lg:justify-center'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className={cn(
                      "flex-1 truncate transition-all duration-200",
                      effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                    )}>{item.name}</span>

                    {/* Tooltip for collapsed state */}
                    {effectiveCollapsed && (
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
              {!effectiveCollapsed && (
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
                      effectiveCollapsed && 'lg:px-0 lg:justify-center'
                    )
                  }
                >
                  <ShieldIcon className="h-5 w-5 shrink-0" />
                  <span className={cn(
                    "flex-1 truncate transition-all duration-200",
                    effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                  )}>Platform Admin</span>

                  {/* Tooltip for collapsed state */}
                  {effectiveCollapsed && (
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
            effectiveCollapsed && "lg:p-1.5"
          )}>
            <div className={cn(
              "flex items-center gap-3 transition-all duration-200 relative group",
              effectiveCollapsed && "lg:justify-center"
            )}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-xs font-bold text-white shadow-md shadow-[#0037b0]/25 shrink-0 select-none">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
              <div className={cn(
                "flex-1 overflow-hidden transition-all duration-200",
                effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>
                <p className="truncate text-sm font-bold text-slate-800">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[10px] font-semibold text-slate-400 mt-0.5">
                  {user?.organizationName}
                </p>
              </div>

              {/* Tooltip for user profile when collapsed */}
              {effectiveCollapsed && (
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
                effectiveCollapsed && "lg:justify-center lg:px-0"
              )}
            >
              <SupportIcon className="h-4.5 w-4.5 shrink-0" />
              <span className={cn(
                "transition-all duration-200",
                effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>Contact Support</span>
              {effectiveCollapsed && (
                <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                  Contact Support
                </div>
              )}
            </a>
            
            {/* Non-PIN roles (admin/manager/etc) still need a way to hand the terminal to a PIN
                user without a full logout, so "Switch User" shows alongside "Logout" for them —
                PIN-eligible roles only ever need the one (they're already PIN-only accounts). */}
            {!userIsPinEligible && hasPos && (
              <button
                onClick={() => {
                  switchUser()
                  if (onClose) onClose()
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-[#eef4ff]/60 hover:text-slate-950 transition-colors relative group cursor-pointer",
                  effectiveCollapsed && "lg:justify-center lg:px-0"
                )}
              >
                <RefreshCw className="h-4.5 w-4.5 shrink-0" />
                <span className={cn(
                  "transition-all duration-200",
                  effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
                )}>Switch User</span>
                {effectiveCollapsed && (
                  <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                    Switch User
                  </div>
                )}
              </button>
            )}

            <button
              onClick={() => {
                if (userIsPinEligible) {
                  switchUser()
                } else {
                  logout()
                }
                if (onClose) onClose()
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-[#eef4ff]/60 hover:text-slate-950 transition-colors relative group cursor-pointer",
                effectiveCollapsed && "lg:justify-center lg:px-0"
              )}
            >
              {userIsPinEligible ? <RefreshCw className="h-4.5 w-4.5 shrink-0" /> : <LogoutIcon className="h-4.5 w-4.5 shrink-0" />}
              <span className={cn(
                "transition-all duration-200",
                effectiveCollapsed && "lg:opacity-0 lg:max-w-0 lg:pointer-events-none lg:overflow-hidden"
              )}>{userIsPinEligible ? 'Switch User' : 'Logout'}</span>
              {effectiveCollapsed && (
                <div className="hidden lg:group-hover:block absolute left-16 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap z-55 pointer-events-none">
                  {userIsPinEligible ? 'Switch User' : 'Logout'}
                </div>
              )}
            </button>
          </div>

          {/* Subtle version code label */}
          <div className={cn(
            "pt-2 px-2.5 flex items-center justify-between border-t border-slate-200/20 select-none mt-2",
            effectiveCollapsed && "lg:justify-center lg:px-0 lg:border-0 lg:pt-1"
          )}>
            <span className="text-[9px] font-bold text-slate-400">
              {effectiveCollapsed ? `v${__APP_VERSION__}` : `Tari v${__APP_VERSION__}`}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
