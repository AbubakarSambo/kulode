const KEY = 'device-org-context'

interface DeviceOrgContext {
  organizationId: string
  organizationName: string
}

/**
 * Remembers which org this browser/device belongs to, separate from the Zustand auth store so it
 * survives a "Switch User" logout — that's what lets the PIN screen look up a PIN without asking
 * for an email again. Only ever set by a real email+password login (see stores/auth.ts setAuth).
 */
export function rememberOrgContext(organizationId: string, organizationName: string) {
  localStorage.setItem(KEY, JSON.stringify({ organizationId, organizationName } satisfies DeviceOrgContext))
}

export function getRememberedOrgContext(): DeviceOrgContext | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DeviceOrgContext) : null
  } catch {
    return null
  }
}

export function forgetOrgContext() {
  localStorage.removeItem(KEY)
}
