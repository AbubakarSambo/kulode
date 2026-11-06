import { classifyPaymentMethod } from './payment-method-kind';

describe('classifyPaymentMethod', () => {
  it.each([
    ['CASH', 'cash'],
    ['Cash', 'cash'],
    ['Card (MP)', 'card'],
    ['Card (FCMB)', 'card'],
    ['MONIEPOINT_POS', 'card'],
    ['PAYSTACK', 'card'],
    ['Transfer (MP)', 'transfer'],
    ['Bank Transfer', 'transfer'],
    ['MONIEPOINT_TRANSFER', 'transfer'],
    ['WALLET', 'wallet'],
    ['OTHER', 'other'],
    ['Cheque', 'other'],
  ])('%s is %s', (method, kind) => {
    expect(classifyPaymentMethod(method)).toBe(kind);
  });
});
