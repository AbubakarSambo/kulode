// Pure scheduling helpers for automated invoice reminders. No database or clock access: every
// function takes "now" and the organization's IANA timezone explicitly so it can be tested.

export interface ScheduleStep {
  /** Days from the invoice due date (negative = before). */
  offsetDays: number;
  /** Label of the WhatsApp template for this step. */
  template: string;
}

export const DEFAULT_SCHEDULE: ScheduleStep[] = [
  { offsetDays: -2, template: 'pre_due' },
  { offsetDays: 0, template: 'due' },
  { offsetDays: 3, template: 'payment_reminder' },
  { offsetDays: 7, template: 'overdue_2' },
];

/** No reminders are sent between these local hours (21:00 to 07:00). */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 7;

/** Invoices more than this many days past due are not auto-enrolled, so switching the feature on never blasts old debt. */
export const ENROLL_LOOKBACK_DAYS = 14;

/** Validates a stored schedule; falls back to the default if it is missing or malformed. */
export function parseSchedule(raw: unknown): ScheduleStep[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SCHEDULE;
  const steps: ScheduleStep[] = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isInteger((item as ScheduleStep).offsetDays) ||
      typeof (item as ScheduleStep).template !== 'string' ||
      !(item as ScheduleStep).template
    ) {
      return DEFAULT_SCHEDULE;
    }
    steps.push({ offsetDays: (item as ScheduleStep).offsetDays, template: (item as ScheduleStep).template });
  }
  return steps.sort((a, b) => a.offsetDays - b.offsetDays);
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(whole));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - whole;
}

/** The UTC instant at which the given wall-clock time occurs in `timeZone`. Day overflow is allowed. */
export function zonedWallTimeToUtc(year: number, monthIndex: number, day: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(year, monthIndex, day, hour, 0, 0);
  let ms = guess - tzOffsetMs(guess, timeZone);
  ms = guess - tzOffsetMs(ms, timeZone);
  return new Date(ms);
}

export function localParts(now: Date, timeZone: string): { year: number; monthIndex: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), monthIndex: get('month') - 1, day: get('day'), hour: get('hour') };
}

export function isQuietHour(now: Date, timeZone: string): boolean {
  const { hour } = localParts(now, timeZone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * When a step becomes due: the invoice due date (a calendar date, stored as UTC midnight) plus the
 * step offset, at `sendHour` local time.
 */
export function stepDueAt(dueDate: Date, step: ScheduleStep, sendHour: number, timeZone: string): Date {
  return zonedWallTimeToUtc(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate() + step.offsetDays,
    sendHour,
    timeZone,
  );
}

/** The next occurrence of `sendHour` local time that is still in the future. */
export function nextSendTime(now: Date, sendHour: number, timeZone: string): Date {
  const { year, monthIndex, day } = localParts(now, timeZone);
  const today = zonedWallTimeToUtc(year, monthIndex, day, sendHour, timeZone);
  return today.getTime() > now.getTime() ? today : zonedWallTimeToUtc(year, monthIndex, day + 1, sendHour, timeZone);
}

/**
 * Index of the first step that has not already passed (its day is today or later in local time), or
 * -1 when every step is in the past. Used when enrolling an invoice mid-way through its schedule.
 */
export function firstPendingStepIndex(
  schedule: ScheduleStep[],
  dueDate: Date,
  sendHour: number,
  timeZone: string,
  now: Date,
): number {
  const { year, monthIndex, day } = localParts(now, timeZone);
  const startOfToday = zonedWallTimeToUtc(year, monthIndex, day, 0, timeZone).getTime();
  return schedule.findIndex((step) => stepDueAt(dueDate, step, sendHour, timeZone).getTime() >= startOfToday);
}
