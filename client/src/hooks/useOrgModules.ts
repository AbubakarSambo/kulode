import { useAuthStore } from '@/stores/auth'
import type { OrgModule, PosMode } from '@/types'

// Orgs with no value set (missing from the payload, not yet hydrated)
// default to INVOICING, matching the Organization.enabledModules DB default.
export function useOrgModules() {
  const enabledModules = useAuthStore((state) => state.user?.organization?.enabledModules) ?? 'INVOICING'

  return {
    enabledModules,
    hasPos: enabledModules === 'POS' || enabledModules === 'BOTH',
    hasInvoicing: enabledModules === 'INVOICING' || enabledModules === 'BOTH',
  }
}

export function hasModule(enabledModules: OrgModule | undefined, required: 'POS' | 'INVOICING'): boolean {
  const modules = enabledModules ?? 'INVOICING'
  return modules === 'BOTH' || modules === required
}

// Orgs with no value set default to RESTAURANT, matching the Organization.posMode DB default —
// gates whether the POS nav/routes resolve to the menu/table/kitchen flow or the retail
// barcode-scan checkout + catalog pages.
export function usePosMode() {
  const posMode = useAuthStore((state) => state.user?.organization?.posMode) ?? 'RESTAURANT'

  return {
    posMode,
    isRetail: posMode === 'RETAIL',
    isRestaurant: posMode === 'RESTAURANT',
  }
}

export function isPosMode(posMode: PosMode | undefined, required: PosMode): boolean {
  return (posMode ?? 'RESTAURANT') === required
}
