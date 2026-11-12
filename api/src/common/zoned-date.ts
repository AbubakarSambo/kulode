// Calendar-day maths in an organization's own timezone. A phone-collection period is "8–30 Nov"
// as the restaurant lives it, not as UTC sees it, so dates stay 'YYYY-MM-DD' strings and are only
// turned into instants at the edges, here.

/** Today's date ('YYYY-MM-DD') in the given IANA timezone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** The instant at which the given local date starts (00:00:00) in the timezone. */
export function startOfZonedDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes so a day that straddles a DST change still lands on local midnight.
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

/** The first instant AFTER the given local date ends — use as an exclusive upper bound. */
export function startOfNextZonedDay(date: string, timeZone: string): Date {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return startOfZonedDay(next, timeZone);
}
