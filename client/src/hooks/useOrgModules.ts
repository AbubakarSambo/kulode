import { useAuthStore } from '@/stores/auth'
import type { OrgModule } from '@/types'

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
