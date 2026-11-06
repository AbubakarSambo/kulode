// The period choices shared by the POS Dashboard and POS Reports pages, and the calendar range
// each one means. Mirrors the dashboard's server-side ranges (api/src/modules/orders/
// pos-dashboard.service.ts getDateRange): Sunday-start weeks, and "today" follows the org's
// business day — with a 06:00 shift start, 5am still belongs to yesterday.

import type { ReportPeriod } from '@/api/reports'

export type ReportsPeriod = Exclude<ReportPeriod, 'LAST_QUARTER' | 'LAST_YEAR'>

export const REPORT_PERIOD_OPTIONS: Array<{ value: ReportsPeriod; label: string }> = [
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'LAST_WEEK', label: 'Last Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'THIS_QUARTER', label: 'This Quarter' },
  { value: 'THIS_YEAR', label: 'This Year' },
  { value: 'CUSTOM', label: 'Custom Range' },
]

export function formatYmd(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The calendar date the business day belongs to right now (before shift start = still yesterday). */
export function businessToday(now: Date, shiftStartTime = '00:00'): Date {
  const [hours, minutes] = shiftStartTime.split(':').map(Number)
  const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now < shiftStart ? 1 : 0))
}

/** Inclusive from/to (YYYY-MM-DD) for a non-custom period. */
export function reportPeriodRange(period: Exclude<ReportsPeriod, 'CUSTOM'>, now: Date, shiftStartTime?: string): { from: string; to: string } {
  const today = businessToday(now, shiftStartTime)
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  switch (period) {
    case 'TODAY':
      return { from: formatYmd(today), to: formatYmd(today) }
    case 'YESTERDAY': {
      const yesterday = new Date(y, m, d - 1)
      return { from: formatYmd(yesterday), to: formatYmd(yesterday) }
    }
    case 'LAST_WEEK': {
      // Based on the calendar date, like the dashboard — not the business date.
      const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
      return {
        from: formatYmd(new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 7)),
        to: formatYmd(new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 1)),
      }
    }
    case 'THIS_MONTH':
      return { from: formatYmd(new Date(y, m, 1)), to: formatYmd(today) }
    case 'LAST_MONTH':
      return { from: formatYmd(new Date(y, m - 1, 1)), to: formatYmd(new Date(y, m, 0)) }
    case 'THIS_QUARTER':
      return { from: formatYmd(new Date(y, Math.floor(m / 3) * 3, 1)), to: formatYmd(today) }
    case 'THIS_YEAR':
      return { from: formatYmd(new Date(y, 0, 1)), to: formatYmd(today) }
  }
}
