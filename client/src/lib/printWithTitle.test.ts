import { describe, expect, it } from 'vitest'
import { reportFileTitle } from './printWithTitle'

describe('reportFileTitle', () => {
  it('names a single day and a range', () => {
    expect(reportFileTitle('Living Room', 'Sales Report', '2026-11-05', '2026-11-05')).toBe('Living Room - Sales Report - 2026-11-05')
    expect(reportFileTitle('Living Room', 'Item Sales Report', '2026-11-01', '2026-11-05')).toBe(
      'Living Room - Item Sales Report - 2026-11-01 to 2026-11-05',
    )
  })

  it('leaves out the org name when it is not loaded yet', () => {
    expect(reportFileTitle(undefined, 'Sales Report', '2026-11-05', '2026-11-05')).toBe('Sales Report - 2026-11-05')
  })
})
