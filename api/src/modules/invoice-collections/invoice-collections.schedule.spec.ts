import {
  DEFAULT_SCHEDULE,
  firstPendingStepIndex,
  isQuietHour,
  nextSendTime,
  parseSchedule,
  stepDueAt,
  zonedWallTimeToUtc,
} from './invoice-collections.schedule';

const LAGOS = 'Africa/Lagos'; // UTC+1, no daylight saving
const dueDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`); // @db.Date values arrive as UTC midnight

describe('invoice collections schedule', () => {
  describe('zonedWallTimeToUtc', () => {
    it('converts Lagos wall time to UTC', () => {
      expect(zonedWallTimeToUtc(2026, 10, 24, 9, LAGOS).toISOString()).toBe('2026-11-24T08:00:00.000Z');
    });

    it('handles day overflow across a month end', () => {
      expect(zonedWallTimeToUtc(2026, 10, 31, 9, LAGOS).toISOString()).toBe('2026-12-01T08:00:00.000Z');
    });

    it('respects a zone with daylight saving', () => {
      // New York is UTC-5 in winter and UTC-4 in summer
      expect(zonedWallTimeToUtc(2026, 0, 15, 9, 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z');
      expect(zonedWallTimeToUtc(2026, 6, 15, 9, 'America/New_York').toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });
  });

  describe('stepDueAt', () => {
    it('places a step relative to the due date at the send hour', () => {
      const d = dueDate('2026-12-10');
      expect(stepDueAt(d, { offsetDays: -2, template: 'pre_due' }, 9, LAGOS).toISOString()).toBe('2026-12-08T08:00:00.000Z');
      expect(stepDueAt(d, { offsetDays: 0, template: 'due' }, 9, LAGOS).toISOString()).toBe('2026-12-10T08:00:00.000Z');
      expect(stepDueAt(d, { offsetDays: 7, template: 'x' }, 9, LAGOS).toISOString()).toBe('2026-12-17T08:00:00.000Z');
    });
  });

  describe('isQuietHour', () => {
    it('is quiet from 21:00 to 07:00 local time', () => {
      expect(isQuietHour(new Date('2026-11-24T20:30:00Z'), LAGOS)).toBe(true); // 21:30 Lagos
      expect(isQuietHour(new Date('2026-11-24T05:59:00Z'), LAGOS)).toBe(true); // 06:59 Lagos
      expect(isQuietHour(new Date('2026-11-24T06:00:00Z'), LAGOS)).toBe(false); // 07:00 Lagos
      expect(isQuietHour(new Date('2026-11-24T19:59:00Z'), LAGOS)).toBe(false); // 20:59 Lagos
    });
  });

  describe('nextSendTime', () => {
    it('returns today at the send hour when it is still ahead', () => {
      expect(nextSendTime(new Date('2026-11-24T05:00:00Z'), 9, LAGOS).toISOString()).toBe('2026-11-24T08:00:00.000Z');
    });

    it('rolls to tomorrow once the send hour has passed', () => {
      expect(nextSendTime(new Date('2026-11-24T20:30:00Z'), 9, LAGOS).toISOString()).toBe('2026-11-25T08:00:00.000Z');
    });
  });

  describe('firstPendingStepIndex', () => {
    const now = new Date('2026-12-10T10:00:00Z'); // due-date morning, Lagos

    it('starts at step 0 for an invoice not yet due', () => {
      expect(firstPendingStepIndex(DEFAULT_SCHEDULE, dueDate('2026-12-20'), 9, LAGOS, now)).toBe(0);
    });

    it('skips steps whose day has already passed', () => {
      // due today: the -2 day step is past, the due-day step is today
      expect(firstPendingStepIndex(DEFAULT_SCHEDULE, dueDate('2026-12-10'), 9, LAGOS, now)).toBe(1);
      // due 4 days ago: only the +7 day step is still ahead
      expect(firstPendingStepIndex(DEFAULT_SCHEDULE, dueDate('2026-12-06'), 9, LAGOS, now)).toBe(3);
    });

    it('returns -1 when every step is in the past', () => {
      expect(firstPendingStepIndex(DEFAULT_SCHEDULE, dueDate('2026-11-20'), 9, LAGOS, now)).toBe(-1);
    });
  });

  describe('parseSchedule', () => {
    it('falls back to the default for missing or malformed input', () => {
      expect(parseSchedule(null)).toBe(DEFAULT_SCHEDULE);
      expect(parseSchedule([])).toBe(DEFAULT_SCHEDULE);
      expect(parseSchedule([{ offsetDays: 'x', template: 'a' }])).toBe(DEFAULT_SCHEDULE);
      expect(parseSchedule([{ offsetDays: 1 }])).toBe(DEFAULT_SCHEDULE);
    });

    it('sorts a valid schedule by offset', () => {
      expect(
        parseSchedule([
          { offsetDays: 5, template: 'b' },
          { offsetDays: -1, template: 'a' },
        ]),
      ).toEqual([
        { offsetDays: -1, template: 'a' },
        { offsetDays: 5, template: 'b' },
      ]);
    });
  });
});
