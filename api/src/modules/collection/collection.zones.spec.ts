import { computeZone, finalZone, outcomeFor } from './collection.zones';

// The Living Room's first period: 8–30 Nov 2026 (23 days), minimum 140, reward threshold 175.
const period = { startDate: '2026-11-08', endDate: '2026-11-30' };
const targets = { minimum: 140, threshold: 175 };
const zone = (count: number, today: string) => computeZone(count, targets, period, today);

describe('computeZone', () => {
  it('produces the brief\'s pace checkpoints', () => {
    expect(zone(0, '2026-11-15')).toMatchObject({ minPace: 49, greenPace: 61 });
    expect(zone(0, '2026-11-22')).toMatchObject({ minPace: 92, greenPace: 115 });
    expect(zone(0, '2026-11-30')).toMatchObject({ minPace: 140, greenPace: 175 });
  });

  it('P7: on 15 Nov a waiter on 48 / 55 / 61 is Red / Normal / Green', () => {
    expect(zone(48, '2026-11-15').zone).toBe('RED');
    expect(zone(55, '2026-11-15').zone).toBe('NORMAL');
    expect(zone(61, '2026-11-15').zone).toBe('GREEN');
  });

  it('P8: a locked period with 139 / 140 / 174 / 175 is Red / Normal / Normal / Green', () => {
    const after = '2026-12-01';
    expect([139, 140, 174, 175].map((c) => zone(c, after).zone)).toEqual(['RED', 'NORMAL', 'NORMAL', 'GREEN']);
    expect(zone(175, after).phase).toBe('FINAL');
  });

  it('P9: 176 minus 3 revoked credits is 173, Normal', () => {
    expect(zone(173, '2026-12-01').zone).toBe('NORMAL');
  });

  it('is not red on day one just because the month is young', () => {
    expect(zone(7, '2026-11-08')).toMatchObject({ zone: 'NORMAL', minPace: 7, greenPace: 8 });
    expect(zone(0, '2026-11-08').zone).toBe('RED');
  });

  it('paces a not-yet-started period as day one', () => {
    expect(zone(0, '2026-11-01')).toMatchObject({ phase: 'UPCOMING', minPace: 7 });
  });

  it('tells staff what to do next', () => {
    expect(zone(61, '2026-11-15').nextStep).toBe('On track for Green');
    expect(zone(55, '2026-11-15').nextStep).toBe('120 to reward');
    expect(zone(40, '2026-11-15').nextStep).toBe('9 behind pace');
    expect(zone(175, '2026-11-20').nextStep).toBe('Reward earned');
  });

  it('single-day periods work', () => {
    expect(computeZone(5, { minimum: 5, threshold: 10 }, { startDate: '2026-11-08', endDate: '2026-11-08' }, '2026-11-08').zone).toBe('NORMAL');
  });
});

describe('outcomeFor (P8: what payroll applies)', () => {
  const rates = { rewardAmount: 40_000, deductionPct: 10 };
  const outcome = (count: number) => outcomeFor(count, targets, rates);

  it('Red below the minimum flags the deduction and no incentive', () => {
    expect(outcome(139)).toEqual({ zone: 'RED', incentiveAmount: 0, deductionPct: 10 });
  });
  it('Normal between minimum and threshold is neither', () => {
    expect(outcome(140)).toEqual({ zone: 'NORMAL', incentiveAmount: 0, deductionPct: 0 });
    expect(outcome(174)).toEqual({ zone: 'NORMAL', incentiveAmount: 0, deductionPct: 0 });
  });
  it('Green at the threshold earns the incentive', () => {
    expect(outcome(175)).toEqual({ zone: 'GREEN', incentiveAmount: 40_000, deductionPct: 0 });
    expect(finalZone(300, targets)).toBe('GREEN');
  });
  it('P9: 176 minus 3 revoked is 173, Normal, no money either way', () => {
    expect(outcome(173)).toEqual({ zone: 'NORMAL', incentiveAmount: 0, deductionPct: 0 });
  });
});
