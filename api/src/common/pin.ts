import { Role } from './decorators/roles.decorator';

// Roles that can use a shared-terminal quick-login PIN instead of email+password.
// Deliberately excludes MANAGER/ADMIN/SUPER_ADMIN/ACCOUNTANT/STAFF — those need remote access
// and touch sensitive settings, so they keep full email+password login only.
export const PIN_ELIGIBLE_ROLES = [Role.WAITER, Role.PASS, Role.RUNNER, Role.CASHIER];

export const PIN_REGEX = /^\d{4}$/;
