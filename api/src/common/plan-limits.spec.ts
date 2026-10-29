import { maxUsersFor } from './plan-limits';

describe('maxUsersFor', () => {
  it('is unlimited during a live PRO trial', () => {
    expect(maxUsersFor('PRO', 'TRIALING')).toBe(Infinity);
  });

  it("uses the plan's own cap once subscribed", () => {
    expect(maxUsersFor('PRO', 'ACTIVE')).toBe(10);
    expect(maxUsersFor('STARTER', 'ACTIVE')).toBe(1);
  });

  it('falls back to the FREE cap once a trial has expired', () => {
    // Callers pass an effective plan of FREE for a TRIALING org past its trialEndDate.
    expect(maxUsersFor('FREE', 'TRIALING')).toBe(1);
  });
});
