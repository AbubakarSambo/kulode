// Red / normal / green zones for a phone-number collection period. Pure so the arithmetic that
// decides a waiter's incentive or deduction is tested on its own. Dates are 'YYYY-MM-DD' strings in
// the org's timezone (never JS Dates), so "today" can't drift across a day boundary.

export type Zone = 'RED' | 'NORMAL' | 'GREEN';
export type PeriodPhase = 'UPCOMING' | 'LIVE' | 'FINAL';

export interface ZoneTargets {
  minimum: number;
  threshold: number;
}

export interface ZoneResult {
  zone: Zone;
  phase: PeriodPhase;
  minPace: number;
  greenPace: number;
  nextStep: string;
}

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function periodPhase(startDate: string, endDate: string, today: string): PeriodPhase {
  if (today < startDate) return 'UPCOMING';
  return today > endDate ? 'FINAL' : 'LIVE';
}

export function computeZone(
  count: number,
  targets: ZoneTargets,
  period: { startDate: string; endDate: string },
  today: string,
): ZoneResult {
  const { minimum, threshold } = targets;
  const phase = periodPhase(period.startDate, period.endDate, today);
  const daysTotal = daysBetween(period.startDate, period.endDate) + 1;
  // Inclusive of today, clamped so a period that hasn't started yet paces as day 1 (not zero).
  const daysElapsed = Math.min(daysTotal, Math.max(1, daysBetween(period.startDate, today) + 1));
  const minPace = Math.ceil((minimum * daysElapsed) / daysTotal);
  const greenPace = Math.ceil((threshold * daysElapsed) / daysTotal);

  if (phase === 'FINAL') {
    const zone: Zone = count >= threshold ? 'GREEN' : count >= minimum ? 'NORMAL' : 'RED';
    const nextStep = zone === 'GREEN' ? 'Reward earned' : zone === 'NORMAL' ? 'No incentive' : 'Below minimum';
    return { zone, phase, minPace, greenPace, nextStep };
  }

  const zone: Zone = count >= greenPace || count >= threshold ? 'GREEN' : count >= minPace ? 'NORMAL' : 'RED';
  let nextStep: string;
  if (count >= threshold) nextStep = 'Reward earned';
  else if (zone === 'GREEN') nextStep = 'On track for Green';
  else if (zone === 'NORMAL') nextStep = `${threshold - count} to reward`;
  else nextStep = `${minPace - count} behind pace`;
  return { zone, phase, minPace, greenPace, nextStep };
}
