import { isTipEligibleMethod, tipNeedsConfirmation } from './tip-rules';

describe('isTipEligibleMethod', () => {
  it.each(['Card (MP)', 'POS Terminal - GTBank', 'Bank Transfer', 'MONIEPOINT_POS', 'MONIEPOINT_TRANSFER'])(
    'allows %s',
    (m) => expect(isTipEligibleMethod(m)).toBe(true),
  );
  it.each(['CASH', 'Cash', 'WALLET', 'Voucher'])('rejects %s', (m) => expect(isTipEligibleMethod(m)).toBe(false));
});

describe('tipNeedsConfirmation', () => {
  it('does not ask for an ordinary tip', () => expect(tipNeedsConfirmation(3000, 23500)).toBe(false));
  it('asks above ₦20,000 but not at exactly ₦20,000', () => {
    expect(tipNeedsConfirmation(20001, 500000)).toBe(true);
    expect(tipNeedsConfirmation(20000, 500000)).toBe(false);
  });
  it('asks above half the bill but not at exactly half', () => {
    expect(tipNeedsConfirmation(6000, 10000)).toBe(true);
    expect(tipNeedsConfirmation(5000, 10000)).toBe(false);
  });
});

import { matchPaymentToOrder } from './tip-rules';

describe('matchPaymentToOrder', () => {
  const TOL = 5000; // ₦50
  it('matches the bill alone with no tip', () => {
    expect(matchPaymentToOrder(2_350_000, 0, 2_350_000, TOL, true)).toEqual({ matches: true, tip: 0 });
  });
  it('matches bill + pending tip and reports the tip', () => {
    expect(matchPaymentToOrder(2_350_000, 300_000, 2_650_000, TOL, true)).toEqual({ matches: true, tip: 3000 });
  });
  it('still matches bill + tip when the transfer is a few naira off', () => {
    expect(matchPaymentToOrder(2_350_040, 300_000, 2_650_000, TOL, true)).toEqual({ matches: true, tip: 3000 });
  });
  it('prefers the bill-alone reading when both would fit', () => {
    expect(matchPaymentToOrder(2_350_000, 3_000, 2_350_000, TOL, true)).toEqual({ matches: true, tip: 0 });
  });
  it('does not expect a tip when tipping is switched off', () => {
    expect(matchPaymentToOrder(2_350_000, 300_000, 2_650_000, TOL, false)).toEqual({ matches: false, tip: 0 });
  });
  it('does not match an amount that fits neither', () => {
    expect(matchPaymentToOrder(2_350_000, 300_000, 2_900_000, TOL, true)).toEqual({ matches: false, tip: 0 });
  });
});
