import { describe, it, expect } from 'vitest'
import { formatWalletNote } from './utils'

describe('formatWalletNote', () => {
  it('makes legacy raw top-up methods readable', () => {
    expect(formatWalletNote('Top-up via BANK_TRANSFER')).toBe('Top-up via Bank Transfer')
    expect(formatWalletNote('Top-up via CASH')).toBe('Top-up via Cash')
  })

  it('leaves already-readable and custom notes alone', () => {
    expect(formatWalletNote('Top-up via Bank Transfer')).toBe('Top-up via Bank Transfer')
    expect(formatWalletNote('Paid for Friday party')).toBe('Paid for Friday party')
  })
})
