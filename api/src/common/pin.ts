import { Role } from './decorators/roles.decorator';
import { PIN_LOGIN_ROLES, APPROVAL_PIN_ROLES } from './permissions';

// Roles that can use a shared-terminal quick-login PIN instead of email+password.
// Deliberately excludes MANAGER/ADMIN/SUPER_ADMIN/ACCOUNTANT/STAFF — those need remote access
// and touch sensitive settings, so they keep full email+password login only.
export const PIN_ELIGIBLE_ROLES = PIN_LOGIN_ROLES as Role[];

// Roles whose PIN can approve a cashier's void/discount. MANAGER and above may hold an
// approval-only PIN that never works for sign-in (pinLogin requires every role PIN-eligible).
export const APPROVER_PIN_ROLES = APPROVAL_PIN_ROLES as Role[];

// Whether a PIN can be set at all for an account with these roles: a sign-in PIN (every role
// PIN-eligible) or an approval-only PIN (holds an approver role).
export function canHoldPin(roles: string[]): boolean {
  return (
    roles.length > 0 &&
    (roles.every((r) => PIN_ELIGIBLE_ROLES.includes(r as Role)) || roles.some((r) => APPROVER_PIN_ROLES.includes(r as Role)))
  );
}

export const PIN_REGEX = /^\d{4}$/;
