import { bucketCollections, splitTopUp, splitWalletDebit } from './shift-report-figures';

describe('bucketCollections', () => {
  it('folds payment methods into the report rows and leaves wallet spending out', () => {
    expect(
      bucketCollections([
        { paymentMethod: 'BANK_TRANSFER', expectedAmount: 145500 },
        { paymentMethod: 'CARD', expectedAmount: 29000 },
        { paymentMethod: 'CASH', expectedAmount: 5000 },
        { paymentMethod: 'MONIEPOINT_POS', expectedAmount: 206800 },
        { paymentMethod: 'MONIEPOINT_TRANSFER', expectedAmount: 155900 },
        { paymentMethod: 'WALLET', expectedAmount: 83950 },
        { paymentMethod: 'Bank Transfer', expectedAmount: 100 },
        { paymentMethod: 'Cheque', expectedAmount: 50 },
      ]),
    ).toEqual({ card: 235800, transfer: 301500, cash: 5000, other: 50 });
  });
});

describe('splitWalletDebit', () => {
  it('is all from balance when the balance covers the charge', () => {
    expect(splitWalletDebit(-30000, 50000)).toEqual({ fromBalance: 30000, onCredit: 0 });
  });
  it('is all credit when the balance is zero or already negative', () => {
    expect(splitWalletDebit(-30000, 0)).toEqual({ fromBalance: 0, onCredit: 30000 });
    expect(splitWalletDebit(-30000, -5000)).toEqual({ fromBalance: 0, onCredit: 30000 });
  });
  it('splits a charge that runs past the balance', () => {
    expect(splitWalletDebit(-30000, 10000)).toEqual({ fromBalance: 10000, onCredit: 20000 });
  });
});

describe('splitTopUp', () => {
  it('is all deposit when the balance is not negative', () => {
    expect(splitTopUp(20000, 0)).toEqual({ repayment: 0, deposit: 20000 });
  });
  it('settles the debt first, then deposits the rest', () => {
    expect(splitTopUp(8000, -3000)).toEqual({ repayment: 3000, deposit: 5000 });
  });
  it('is all repayment when it does not clear the debt', () => {
    expect(splitTopUp(2000, -3000)).toEqual({ repayment: 2000, deposit: 0 });
  });
});
