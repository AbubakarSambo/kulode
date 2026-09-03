// An org's "shift hours" define what a restaurant considers one business day (e.g. a bar open
// 6pm-2am wants a report on "last night" to include sales made after midnight). Reports/dashboards
// that bucket by calendar day should re-anchor their day boundaries onto these hours instead of
// literal midnight-to-midnight, via the helpers below.

export interface ShiftHours {
  shiftStartTime: string; // "HH:mm", 24-hour
  shiftEndTime: string; // "HH:mm", 24-hour
}

export const DEFAULT_SHIFT_HOURS: ShiftHours = { shiftStartTime: '00:00', shiftEndTime: '23:59' };

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

// A shift "crosses midnight" whenever its end time is at or before its start time on the clock
// (e.g. 18:00 -> 02:00). A same-day shift (06:00 -> 18:00) never satisfies this.
function isOvernightShift(shift: ShiftHours): boolean {
  const start = parseTime(shift.shiftStartTime);
  const end = parseTime(shift.shiftEndTime);
  return end.hours * 60 + end.minutes <= start.hours * 60 + start.minutes;
}

/** The shift-start instant for the business day anchored on the given calendar date. */
export function shiftStartFor(date: Date, shift: ShiftHours): Date {
  const { hours, minutes } = parseTime(shift.shiftStartTime);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

/**
 * The shift-end instant for the business day anchored on the given calendar date — rolls into
 * the next calendar day when the shift crosses midnight.
 */
export function shiftEndFor(date: Date, shift: ShiftHours): Date {
  const { hours, minutes } = parseTime(shift.shiftEndTime);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 59, 999);
  if (isOvernightShift(shift)) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

/**
 * Re-anchors a midnight-to-midnight calendar range onto the org's shift hours: the first day's
 * shift-start replaces its 00:00, the last day's shift-end replaces its 23:59:59. Only the
 * calendar date (year/month/day) of each input is read — any time-of-day already on them is
 * discarded, so this is safe to call on ranges built the old, timezone-naive way.
 */
export function applyShiftHours(startDate: Date, endDate: Date, shift: ShiftHours): { startDate: Date; endDate: Date } {
  return {
    startDate: shiftStartFor(startDate, shift),
    endDate: shiftEndFor(endDate, shift),
  };
}
