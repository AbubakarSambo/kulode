// Pure money maths behind the shift-close WhatsApp report, kept separate from the Prisma queries
// so each rule can be unit tested.
//
// The rule underneath all of it: a WALLET tender is not money received. Wallet money was received
// when the customer topped up, or it is credit the customer now owes. Each wallet movement stores
// balanceBefore, so it can be split exactly into those parts.

import { classifyPaymentMethod } from '../../common/payment-method-kind';

export interface CollectionRow {
  paymentMethod: string;
  expectedAmount: number;
}

export interface CollectionBuckets {
  card: number;
  transfer: number;
  cash: number;
  other: number;
}

// Folds the shift's per-method totals (order payments + wallet top-ups) into the fixed rows of the
// WhatsApp report. Method names are free-form per org (PaymentType names like "Bank Transfer",
// plus reserved literals like MONIEPOINT_POS), so match on a normalised name; anything
// unrecognised lands in "other" rather than being silently mislabelled. WALLET is skipped:
// spending wallet balance brings no new money in.
export function bucketCollections(breakdown: CollectionRow[]): CollectionBuckets {
  const totals: CollectionBuckets = { card: 0, transfer: 0, cash: 0, other: 0 };
  for (const row of breakdown) {
    const kind = classifyPaymentMethod(row.paymentMethod);
    if (kind === 'wallet') continue;
    totals[kind] += row.expectedAmount;
  }
  return totals;
}

// An ORDER_DEBIT: the part covered by the customer's positive balance was paid for earlier (by a
// top-up); whatever pushed the balance below zero is new credit.
export function splitWalletDebit(amount: number, balanceBefore: number) {
  const charged = Math.abs(amount);
  const fromBalance = Math.min(charged, Math.max(balanceBefore, 0));
  return { fromBalance, onCredit: round2(charged - fromBalance) };
}

// A TOPUP: the part that brings a negative balance back up to zero settles credit; the rest is a
// fresh deposit.
export function splitTopUp(amount: number, balanceBefore: number) {
  const received = Math.abs(amount);
  const repayment = Math.min(received, Math.max(-balanceBefore, 0));
  return { repayment, deposit: round2(received - repayment) };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
