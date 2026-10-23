import { previousComparableRange } from './pos-dashboard.service';

const at = (iso: string) => new Date(iso);

describe('previousComparableRange', () => {
  // An 08:00 → 02:00 business day, as applyShiftHours builds it for "Today".
  const todayStart = at('2026-10-23T08:00:00.000Z');
  const todayEnd = at('2026-10-24T02:00:00.000Z');

  it('compares today-so-far with yesterday up to the same time of day', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-23T14:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-22T08:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-22T14:00:00.000Z');
  });

  it('compares a finished business day with the whole previous business day', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-24T09:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-22T08:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-23T02:00:00.000Z');
  });

  it('steps a week back by seven days', () => {
    const prev = previousComparableRange(at('2026-10-11T00:00:00.000Z'), at('2026-10-17T23:59:59.000Z'), at('2026-10-23T12:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-10T23:59:59.000Z');
  });

  it('never ends before it starts when now is before the period opens', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-23T06:00:00.000Z'));
    expect(prev.endDate.getTime()).toBe(prev.startDate.getTime());
  });
});
