import { Prisma } from '@prisma/client';

// Template values for the two customer messages. The wording lives in the Meta-approved templates
// (loyalty_welcome_v1, loyalty_reward_earned_v1); these helpers only build what goes in the slots.

type Money = (n: number) => string;

/** "₦100,000" in the organization's currency (falls back to a plain number if the code is unknown). */
export function moneyFormatter(currency: string | null | undefined): Money {
  const code = (currency || 'NGN').toUpperCase();
  try {
    const f = new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: 0 });
    return (n) => f.format(n);
  } catch {
    return (n) => `${code} ${Math.round(n).toLocaleString('en-NG')}`;
  }
}

const joinOr = (names: string[]) => names.join(' or ');

export interface RuleForMessage {
  name: string;
  thresholdAmount: Prisma.Decimal | number;
  items: { menuItem: { name: string } }[];
}

const itemNames = (r: RuleForMessage) => r.items.map((i) => i.menuItem.name);

/**
 * Body values for loyalty_welcome_v1, in placeholder order:
 * {{1}} name, {{2}} restaurant, {{3}} first reward's spend, {{4}} first reward's items,
 * {{5}} second reward's spend, {{6}} second reward's item.
 * The approved template describes exactly two rewards, so any other number returns null (the
 * message is skipped with a reason rather than sent with wrong wording).
 */
export function welcomeValues(customerName: string, orgName: string, rules: RuleForMessage[], money: Money): string[] | null {
  if (rules.length !== 2 || rules.some((r) => r.items.length === 0)) return null;
  const [meal, milestone] = rules;
  return [customerName, orgName, money(Number(meal.thresholdAmount)), joinOr(itemNames(meal)), money(Number(milestone.thresholdAmount)), joinOr(itemNames(milestone))];
}

/** "a free Nigerian Breakfast or Smoked Chicken Salad", or "2 free Meal Rewards and a free Reward Platter". */
export function rewardText(earned: { count: number; items: string[]; name: string }[]): string {
  return earned
    .map((e) => {
      const what = e.items.length ? joinOr(e.items) : e.name;
      return e.count > 1 ? `${e.count} free ${what}` : `a free ${what}`;
    })
    .join(' and ');
}

export function expiryText(expiresAt: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(expiresAt);
  } catch {
    return expiresAt.toISOString().slice(0, 10);
  }
}

export interface RewardMessagePayload {
  rewardText: string;
  expiryText: string;
}

/** Body values for loyalty_reward_earned_v1: {{1}} name, {{2}} restaurant, {{3}} reward, {{4}} expiry date. */
export function rewardEarnedValues(customerName: string, orgName: string, payload: RewardMessagePayload): string[] {
  return [customerName, orgName, payload.rewardText, payload.expiryText];
}
