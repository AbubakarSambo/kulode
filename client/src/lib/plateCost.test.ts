import { describe, it, expect } from 'vitest'
import { plateMargin } from './plateCost'

describe('plateMargin', () => {
  it('returns null when the dish has no recipe', () => {
    expect(plateMargin(5000, null)).toBeNull()
  })

  it('computes profit, food cost % and margin %', () => {
    expect(plateMargin(6500, 2080)).toEqual({
      plateCost: 2080,
      grossProfit: 4420,
      foodCostPct: 32,
      marginPct: 68,
      level: 'good',
    })
  })

  it('flags dishes above target and above the high threshold', () => {
    expect(plateMargin(1000, 380)?.level).toBe('watch')
    expect(plateMargin(1000, 450)?.level).toBe('high')
  })

  it('treats a free item with a cost as high, with no percentage', () => {
    expect(plateMargin(0, 200)).toMatchObject({ grossProfit: -200, foodCostPct: null, level: 'high' })
  })
})
