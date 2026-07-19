import type { InvoiceStatus } from '@/types'

// Canonical invoice lifecycle labels/colours. Every surface (list, detail,
// dashboard, onboarding success) must render status through this map so a
// DRAFT is never presented as issued/sent.
export interface InvoiceStatusConfig {
  label: string
  dot: string
  text: string
  badge: string
}

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, InvoiceStatusConfig> = {
  DRAFT: {
    label: 'Draft',
    dot: 'bg-slate-400',
    text: 'text-slate-500',
    badge: 'bg-slate-100 text-slate-600',
  },
  SENT: {
    label: 'Sent',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    badge: 'bg-blue-50 text-blue-700',
  },
  PARTIALLY_PAID: {
    label: 'Part Paid',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    badge: 'bg-amber-50 text-amber-700',
  },
  PAID: {
    label: 'Paid',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  OVERDUE: {
    label: 'Overdue',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    badge: 'bg-rose-50 text-rose-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    dot: 'bg-slate-400',
    text: 'text-slate-550',
    badge: 'bg-slate-100 text-slate-500',
  },
}

export const getInvoiceStatusConfig = (status: string): InvoiceStatusConfig =>
  INVOICE_STATUS_CONFIG[status.toUpperCase() as InvoiceStatus] ?? {
    label: status.replace('_', ' '),
    dot: 'bg-slate-400',
    text: 'text-slate-500',
    badge: 'bg-slate-100 text-slate-600',
  }

// Drafts have not been issued yet — date rows must say "Created", not "Issued".
export const getIssueDateLabel = (status: string): string =>
  status.toUpperCase() === 'DRAFT' ? 'Created' : 'Issued'
