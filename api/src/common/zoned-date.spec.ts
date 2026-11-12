import { startOfNextZonedDay, startOfZonedDay, todayInZone } from './zoned-date';

describe('zoned dates', () => {
  it('Lagos (UTC+1) days start at 23:00 UTC the day before', () => {
    expect(startOfZonedDay('2026-11-08', 'Africa/Lagos').toISOString()).toBe('2026-11-07T23:00:00.000Z');
    expect(startOfNextZonedDay('2026-11-30', 'Africa/Lagos').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('works for zones behind UTC and for UTC itself', () => {
    expect(startOfZonedDay('2026-11-08', 'America/New_York').toISOString()).toBe('2026-11-08T05:00:00.000Z');
    expect(startOfZonedDay('2026-11-08', 'UTC').toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('todayInZone reads the local calendar date, not the UTC one', () => {
    const lateEveningUtc = new Date('2026-11-12T23:30:00Z'); // already 00:30 on the 13th in Lagos
    expect(todayInZone('Africa/Lagos', lateEveningUtc)).toBe('2026-11-13');
    expect(todayInZone('UTC', lateEveningUtc)).toBe('2026-11-12');
  });
});
