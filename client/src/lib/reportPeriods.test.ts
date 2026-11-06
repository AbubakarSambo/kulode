import { describe, expect, it } from 'vitest'
import { businessToday, reportPeriodRange } from './reportPeriods'

// Thursday 5 Nov 2026, 14:00 local.
const now = new Date(2026, 10, 5, 14, 0)

describe('reportPeriodRange', () => {
  it('covers today and yesterday', () => {
    expect(reportPeriodRange('TODAY', now)).toEqual({ from: '2026-11-05', to: '2026-11-05' })
    expect(reportPeriodRange('YESTERDAY', now)).toEqual({ from: '2026-11-04', to: '2026-11-04' })
  })

  it('uses Sunday-start weeks for last week', () => {
    expect(reportPeriodRange('LAST_WEEK', now)).toEqual({ from: '2026-10-25', to: '2026-10-31' })
  })

  it('covers this/last month, quarter and year', () => {
    expect(reportPeriodRange('THIS_MONTH', now)).toEqual({ from: '2026-11-01', to: '2026-11-05' })
    expect(reportPeriodRange('LAST_MONTH', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(reportPeriodRange('THIS_QUARTER', now)).toEqual({ from: '2026-10-01', to: '2026-11-05' })
    expect(reportPeriodRange('THIS_YEAR', now)).toEqual({ from: '2026-01-01', to: '2026-11-05' })
  })

  it("treats the small hours as the previous business day when the shift hasn't started", () => {
    const fiveAm = new Date(2026, 10, 5, 5, 0)
    expect(businessToday(fiveAm, '06:00')).toEqual(new Date(2026, 10, 4))
    expect(reportPeriodRange('TODAY', fiveAm, '06:00')).toEqual({ from: '2026-11-04', to: '2026-11-04' })
    expect(reportPeriodRange('TODAY', fiveAm, '00:00')).toEqual({ from: '2026-11-05', to: '2026-11-05' })
  })
})
