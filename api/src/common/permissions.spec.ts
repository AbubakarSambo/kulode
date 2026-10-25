import { PERMISSIONS, Permission, RoleName, hasPermission, FLOOR_STAFF_ROLES, PIN_LOGIN_ROLES } from './permissions';

const LADDER: RoleName[] = ['WAITER', 'CASHIER', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const permissions = Object.keys(PERMISSIONS) as Permission[];

describe('POS permission matrix', () => {
  // The whole point of the ladder: promoting someone never takes anything away.
  it.each(LADDER.slice(0, -1).map((role, i) => [role, LADDER[i + 1]]))(
    'everything a %s can do, a %s can also do',
    (lower, higher) => {
      const lost = permissions.filter((p) => hasPermission([lower], p) && !hasPermission([higher], p));
      expect(lost).toEqual([]);
    },
  );

  it('keeps the kitchen track out of selling, money and set-up', () => {
    const kitchenCan = permissions.filter((p) => hasPermission(['KITCHEN'], p));
    expect(kitchenCan).toEqual(['PRINT_RETRY']);
  });

  it('makes a cashier get approval for voids and discounts', () => {
    expect(hasPermission(['CASHIER'], 'ORDER_VOID_DISCOUNT')).toBe(true);
    expect(hasPermission(['CASHIER'], 'ORDER_APPROVE')).toBe(false);
    expect(hasPermission(['SUPERVISOR'], 'ORDER_APPROVE')).toBe(true);
  });

  it('keeps every approver able to void (approving implies the action itself)', () => {
    for (const role of PERMISSIONS.ORDER_APPROVE) {
      expect(hasPermission([role], 'ORDER_VOID_DISCOUNT')).toBe(true);
    }
  });

  it('only lets a manager staff floor roles that can PIN-sign-in', () => {
    expect([...FLOOR_STAFF_ROLES].sort()).toEqual([...PIN_LOGIN_ROLES].sort());
    expect(FLOOR_STAFF_ROLES).not.toContain('MANAGER');
  });

  it('treats a multi-role account as the union of its roles', () => {
    expect(hasPermission(['WAITER'], 'POS_REPORTS_ALL')).toBe(false);
    expect(hasPermission(['WAITER', 'CASHIER'], 'POS_REPORTS_ALL')).toBe(true);
    expect(hasPermission([], 'ORDER_SELL')).toBe(false);
    expect(hasPermission(undefined, 'ORDER_SELL')).toBe(false);
  });
});
