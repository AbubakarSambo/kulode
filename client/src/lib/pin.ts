import type { UserRole } from '@/types'

// Roles that can use a shared-terminal quick-login PIN instead of email+password —
// mirrors PIN_ELIGIBLE_ROLES in api/src/common/pin.ts.
export const PIN_ELIGIBLE_ROLES: UserRole[] = ['WAITER', 'PASS', 'RUNNER', 'CASHIER']
