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
