export interface DiscountRule {
  ratePct: number;
  menuItemIds: string[];
  categoryIds: string[];
}

export interface DiscountLine {
  menuItemId: string | null;
  categoryIds: string[];
  amount: number;
  /** A redeemed loyalty reward — already free, never discounted again */
  isReward: boolean;
}

/** The best rate a line qualifies for: a rule matches by the item itself or by any of its categories. */
export function bestRateFor(line: DiscountLine, rules: DiscountRule[]): number {
  if (line.isReward || line.amount <= 0 || !line.menuItemId) return 0;
  let best = 0;
  for (const rule of rules) {
    const matches = rule.menuItemIds.includes(line.menuItemId) || line.categoryIds.some((c) => rule.categoryIds.includes(c));
    if (matches && rule.ratePct > best) best = rule.ratePct;
  }
  return best;
}

/**
 * What a member discount takes off an order: for each line, its best qualifying rate (two rules
 * never stack on one line), worked in whole kobo so the total never drifts. Returned in naira.
 */
export function memberDiscountFor(lines: DiscountLine[], rules: DiscountRule[]): number {
  let kobo = 0;
  for (const line of lines) {
    const rate = bestRateFor(line, rules);
    if (rate > 0) kobo += Math.round(Math.round(line.amount * 100) * (rate / 100));
  }
  return kobo / 100;
}

export const MEMBER_DISCOUNT_LABEL = 'Member discount';

/** The reason shown on the order: the member discount alone, or alongside the manual discount it was stacked with. */
export function discountReasonWith(baseReason: string | null | undefined, hasBase: boolean): string {
  if (!hasBase) return MEMBER_DISCOUNT_LABEL;
  return `${stripMemberLabel(baseReason) ?? 'Discount'} + ${MEMBER_DISCOUNT_LABEL}`;
}

/** A reason with the member-discount label taken off ("Manager comp + Member discount" → "Manager comp"; null if nothing is left). */
export function stripMemberLabel(reason: string | null | undefined): string | null {
  const base = (reason ?? '').replace(/^Member discount( \+ )?/, '').replace(/( \+ )?Member discount$/, '').trim();
  return base || null;
}
