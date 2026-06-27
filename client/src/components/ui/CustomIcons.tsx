import { HugeiconsIcon } from '@hugeicons/react'
import {
  DashboardSquare02Icon,
  UserGroupIcon,
  Invoice03Icon,
  CreditCardIcon,
  WalletRemove01Icon,
  Store04Icon,
  PackageIcon,
  Grid02Icon,
  AnalyticsIcon,
  PercentCircleIcon,
  Settings02Icon,
  HelpCircleIcon,
  Logout01Icon,
  SecurityLockIcon,
  LockPasswordIcon,
  AiBrain02Icon,
  AiChat01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface IconProps {
  className?: string
}

const SIZE = 20

// 1. Dashboard
export function DashboardIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={DashboardSquare02Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 2. Clients
export function ClientsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={UserGroupIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 3. Invoices
export function InvoicesIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Invoice03Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 4. Payments
export function PaymentsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={CreditCardIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 5. Vendors — Store icon (semantically correct: supplier/merchant)
export function VendorsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Store04Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 6. Expenses — WalletRemove (semantically correct: outgoing money)
export function ExpensesIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={WalletRemove01Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 7. Inventory — Package
export function InventoryIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={PackageIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 8. Services — Grid catalogue
export function ServicesIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Grid02Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 9. Reports — Analytics
export function ReportsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={AnalyticsIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 9b. AI Insights — Brain
export function InsightsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={AiBrain02Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 9c. AI Chat
export function AiChatIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={AiChat01Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 10. Tax — Percent Circle
export function TaxIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={PercentCircleIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 11. Settings
export function SettingsIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Settings02Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 12. Support
export function SupportIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={HelpCircleIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 13. Logout
export function LogoutIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Logout01Icon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 14. Shield / Platform Admin
export function ShieldIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={SecurityLockIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}

// 15. Lock (plan gating indicator)
export function LockIcon({ className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={LockPasswordIcon}
      size={SIZE}
      color="currentColor"
      strokeWidth={1.5}
      className={cn('shrink-0', className)}
    />
  )
}
