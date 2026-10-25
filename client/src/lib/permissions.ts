// Mirror of api/src/common/permissions.ts — the single who-can-do-what matrix for the POS. Don't
// edit one without the other: permissions.test.ts imports the API file and fails on any drift.
//
// The floor roles form a ladder — WAITER → CASHIER → SUPERVISOR → MANAGER → ADMIN → SUPER_ADMIN —
// where each step can do everything the one below can, plus more. PASS/RUNNER/KITCHEN are a
// separate kitchen track. STAFF/ACCOUNTANT are invoicing-org roles; they're listed only where
// they already had access before the ladder existed, so legacy accounts keep working.

export type RoleName =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'ACCOUNTANT'
  | 'STAFF'
  | 'MANAGER'
  | 'SUPERVISOR'
  | 'CASHIER'
  | 'WAITER'
  | 'PASS'
  | 'RUNNER'
  | 'KITCHEN'

const KITCHEN_TRACK: RoleName[] = ['PASS', 'RUNNER', 'KITCHEN']
const LEGACY: RoleName[] = ['STAFF', 'ACCOUNTANT']
const ADMINS: RoleName[] = ['ADMIN', 'SUPER_ADMIN']
const MANAGER_UP: RoleName[] = ['MANAGER', ...ADMINS]
const SUPERVISOR_UP: RoleName[] = ['SUPERVISOR', ...MANAGER_UP]
const CASHIER_UP: RoleName[] = ['CASHIER', ...SUPERVISOR_UP]
const WAITER_UP: RoleName[] = ['WAITER', ...CASHIER_UP]

export const PERMISSIONS = {
  // Sell: create orders, add/edit items, set customer/waiter/notes/order type
  ORDER_SELL: [...WAITER_UP, ...LEGACY],
  // Merge orders, move items between them, mark an order ready for payment
  ORDER_MERGE_MOVE: WAITER_UP,
  // Void an order or apply a discount. Roles below ORDER_APPROVE (i.e. CASHIER) must include an
  // approver's PIN — a cashier voiding/discounting their own sales unsupervised is the classic
  // till-theft pattern.
  ORDER_VOID_DISCOUNT: [...CASHIER_UP, ...LEGACY],
  ORDER_APPROVE: [...SUPERVISOR_UP, ...LEGACY],
  // Close an order and take payment (incl. Paystack checkout)
  PAYMENT_TAKE: [...CASHIER_UP, ...LEGACY],
  // Move a payment that landed on the wrong customer — a correction, so it sits above the cashier
  PAYMENT_REASSIGN: [...SUPERVISOR_UP, 'ACCOUNTANT'],
  // POS payments list
  POS_PAYMENTS_VIEW: CASHIER_UP,
  // Unreconciled Moniepoint transfers: list, assign, resolve to wallet, ignore
  UNRECONCILED_TRANSFERS: CASHIER_UP,
  // Open/close a shift (the cash-up)
  SHIFT_OPEN_CLOSE: [...CASHIER_UP, ...LEGACY],
  SHIFT_BACKDATE: MANAGER_UP,
  // Customer wallet
  WALLET_TOPUP: [...CASHIER_UP, 'ACCOUNTANT'],
  // A manual balance edit with no money behind it — the riskiest thing on the till
  WALLET_ADJUST: MANAGER_UP,
  // Grant/limit customer credit — a lending decision
  CUSTOMER_CREDIT: MANAGER_UP,
  // Floor set-up: tables, menu items/categories/recipes, order types, payment types
  TABLE_MANAGE: MANAGER_UP,
  MENU_MANAGE: MANAGER_UP,
  POS_CONFIG_MANAGE: MANAGER_UP,
  // Re-queue a failed print job — the kitchen is standing next to the jammed printer
  PRINT_RETRY: [...KITCHEN_TRACK, ...CASHIER_UP],
  // Item-sales report. WAITER only ever sees their own orders (see POS_REPORTS_ALL).
  POS_REPORTS_VIEW: [...WAITER_UP, ...LEGACY],
  POS_REPORTS_ALL: [...CASHIER_UP, ...LEGACY],
  POS_DASHBOARD_VIEW: [...SUPERVISOR_UP, ...LEGACY],
  // Stock counts/restocks vs. creating/editing/deleting/importing inventory items
  INVENTORY_ADJUST: MANAGER_UP,
  INVENTORY_MANAGE: ADMINS,
  // Staff roster. MANAGER may only touch FLOOR_STAFF_ROLES accounts (enforced in UsersService)
  // ADMIN may touch anyone but admins; SUPER_ADMIN anyone.
  STAFF_MANAGE: MANAGER_UP,
} as const satisfies Record<string, readonly RoleName[]>

export type Permission = keyof typeof PERMISSIONS

// Accounts a MANAGER may create, edit, remove, or set a PIN for.
export const FLOOR_STAFF_ROLES: RoleName[] = ['WAITER', 'CASHIER', 'SUPERVISOR', ...KITCHEN_TRACK]

// Roles that can sign in with a shared-terminal PIN instead of email+password. MANAGER and above
// keep email+password only (they have remote access and touch sensitive settings).
export const PIN_LOGIN_ROLES: RoleName[] = ['WAITER', 'CASHIER', 'SUPERVISOR', ...KITCHEN_TRACK]

// Roles whose PIN can approve a cashier's void/discount at the till. MANAGER/ADMIN/SUPER_ADMIN
// can hold an approval-only PIN — it never works for sign-in (see PIN_LOGIN_ROLES).
export const APPROVAL_PIN_ROLES: RoleName[] = SUPERVISOR_UP

export function hasPermission(roles: readonly string[] | undefined, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[]
  return !!roles?.some((r) => allowed.includes(r))
}

// Convenience for components: `can(user, 'PAYMENT_TAKE')`.
export function can(user: { roles?: readonly string[] } | null | undefined, permission: Permission): boolean {
  return hasPermission(user?.roles, permission)
}

// A sign-in PIN needs every role PIN-eligible; an approval-only PIN just needs one approver role.
export function canHoldPin(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false
  return (
    roles.every((r) => (PIN_LOGIN_ROLES as readonly string[]).includes(r)) ||
    roles.some((r) => (APPROVAL_PIN_ROLES as readonly string[]).includes(r))
  )
}
