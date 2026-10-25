import type { UserRole } from '@/types'
import { PIN_LOGIN_ROLES } from './permissions'

// Roles that can use a shared-terminal quick-login PIN instead of email+password — sourced from
// the shared permission matrix (lib/permissions.ts, mirroring api/src/common/permissions.ts).
export const PIN_ELIGIBLE_ROLES = PIN_LOGIN_ROLES as UserRole[]

// A user is only PIN-eligible if EVERY role they hold is PIN-eligible — a single admin-tier
// role mixed in (e.g. Manager + Waiter) means that account must use full email+password login.
// `roles` is defensively optional: a stale cached session from before multi-role support (old
// shape had a single `role` string, no `roles` array) should read as "not eligible", not crash.
export function isPinEligible(roles: UserRole[] | undefined | null): boolean {
  return !!roles && roles.length > 0 && roles.every((r) => PIN_ELIGIBLE_ROLES.includes(r))
}
