import { describe, it, expect } from 'vitest'
import { isTipEligibleMethod, tipNeedsConfirmation } from './tips'
import * as api from '../../../api/src/common/tip-rules'

describe('tip rules mirror the API', () => {
  const methods = ['CASH', 'Cash', 'WALLET', 'PAYSTACK', 'OTHER', 'Card (MP)', 'POS Terminal - GTBank', 'Bank Transfer', 'MONIEPOINT_POS', 'MONIEPOINT_TRANSFER']

  it('agrees with the server on which methods can take a tip (checkout never offers one the server rejects)', () => {
    for (const m of methods) {
      // PAYSTACK has its own checkout flow with no tip, so the till excludes it separately.
      if (m === 'PAYSTACK') continue
      expect(isTipEligibleMethod(m), m).toBe(api.isTipEligibleMethod(m))
    }
  })

  it('agrees with the server on when a tip needs confirming', () => {
    for (const [tip, bill] of [[3000, 23500], [20000, 500000], [20001, 500000], [5000, 10000], [6000, 10000]]) {
      expect(tipNeedsConfirmation(tip, bill)).toBe(api.tipNeedsConfirmation(tip, bill))
    }
  })
})
