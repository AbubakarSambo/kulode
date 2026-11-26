import { describe, expect, it } from 'vitest'
import { renewalWording } from './renewalWording'

const card = { type: 'visa', last4: '4081' }
const bank = { status: 'ACTIVE' as const, bankName: 'Zenith Bank', last4: '6789' }

const wording = (methods: { card?: typeof card; directDebit?: typeof bank | { status: 'PENDING'; bankName: null; last4: null } }, billingPeriod: 'MONTHLY' | 'ANNUAL' = 'MONTHLY', isTestAccount = false) =>
  renewalWording({
    billingPeriod,
    isTestAccount,
    paymentMethods: { card: methods.card ?? null, directDebit: methods.directDebit ?? null, directDebitMaxAmount: 100000, renewalPending: false },
  })

describe('renewalWording', () => {
  it('never mentions a card when only a bank account is linked', () => {
    const result = wording({ directDebit: bank })
    expect(result.authorization).toBe('Secure bank authorization saved via Paystack')
    expect(result.enabled).toBe('Each renewal is taken from Zenith Bank •••• 6789. If a debit fails, we will email you.')
  })

  it('names the card as the fallback when both are saved', () => {
    expect(wording({ card, directDebit: bank }).enabled).toMatch(/Zenith Bank.*your card is charged instead/)
  })

  it('keeps card wording for a card alone, and while a bank account is still pending', () => {
    for (const result of [wording({ card }), wording({ card, directDebit: { status: 'PENDING', bankName: null, last4: null } })]) {
      expect(result.authorization).toBe('Secure card authorization saved via Paystack')
      expect(result.enabled).toMatch(/Your card will be automatically charged/)
    }
  })

  it('charges the card for a long term, except on a test account', () => {
    expect(wording({ card, directDebit: bank }, 'ANNUAL').useBank).toBe(false)
    expect(wording({ directDebit: bank }, 'ANNUAL').enabled).toMatch(/will not renew automatically/)
    expect(wording({ directDebit: bank }, 'ANNUAL', true).useBank).toBe(true)
  })

  it('says so when nothing is saved', () => {
    expect(wording({}).authorization).toBe('No payment method saved')
    expect(wording({}).enabled).toMatch(/No payment method is saved/)
  })
})
