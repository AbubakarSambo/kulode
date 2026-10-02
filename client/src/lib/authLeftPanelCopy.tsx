import type { ReactNode } from 'react'

export interface AuthLeftPanelCopy {
  headline: ReactNode
  description: string
  cardSubtitle: string
  card1Title: string
  card1Subtitle: string
  card2Line: ReactNode
  amountLabel: string
}

// Shared between Register.tsx and Login.tsx's left branding panels, and the "Create your
// account"/card subtitle text, so the two auth pages can't drift apart on copy again.
// RESTAURANT is the actual product default (Organization.posMode defaults to RESTAURANT
// server-side when no `?type=` is given) — not a placeholder, so an organic visit with no
// param gets the same restaurant-led pitch as `?type=restaurant`, never invoicing copy.
export const LEFT_PANEL_COPY: Record<'RESTAURANT' | 'RETAIL', AuthLeftPanelCopy> = {
  RESTAURANT: {
    headline: <>Nigeria's modern restaurant & <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-white bg-clip-text text-transparent">bar POS</span></>,
    description: 'Take orders tableside, fire tickets to the kitchen instantly, manage your floor, and reconcile every shift — even when the network drops.',
    cardSubtitle: 'Point of sale, kitchen tickets, and shift reconciliation for Nigerian restaurants and bars.',
    card1Title: 'Order Placed',
    card1Subtitle: 'Table 4 · Dine In',
    card2Line: <>Kitchen ticket fired to <span className="text-blue-600 underline">Bar + Kitchen</span></>,
    amountLabel: 'Order Total',
  },
  RETAIL: {
    headline: <>Nigeria's modern retail & <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-white bg-clip-text text-transparent">supermarket POS</span></>,
    description: 'Scan barcodes at checkout, manage your catalog and stock levels, and reconcile every till — even when the network drops.',
    cardSubtitle: 'Barcode-scan checkout, catalog, and stock management for Nigerian retail stores.',
    card1Title: 'Item Scanned',
    card1Subtitle: 'Coca-Cola 50cl',
    card2Line: <>Receipt printed at <span className="text-blue-600 underline">Register 1</span></>,
    amountLabel: 'Total Due',
  },
}

export function usePosModeFromSearchParam(value: string | null): 'RESTAURANT' | 'RETAIL' | undefined {
  const type = value?.toLowerCase()
  if (type === 'retail') return 'RETAIL'
  if (type === 'restaurant') return 'RESTAURANT'
  return undefined
}
