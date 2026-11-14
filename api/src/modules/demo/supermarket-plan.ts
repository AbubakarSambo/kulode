import { LAGOS_UTC_OFFSET_MINUTES, PaymentKind } from './demo.constants';
import {
  DEPARTMENTS,
  SUPERMARKET_BASE_ORDERS_PER_DAY,
  SUPERMARKET_CLOSE_MINUTE,
  SUPERMARKET_HISTORY_DAYS,
  SUPERMARKET_HOURLY_WEIGHTS,
  SUPERMARKET_OPEN_MINUTE,
  SUPERMARKET_PAYMENT_MIX,
  SUPERMARKET_WEEKDAY_FACTORS,
  SUPERMARKET_ORG_SETTINGS,
} from './supermarket.constants';
import { DayKey, Rng, atMinute, randInt, rngFor, weightedIndex } from './demo-plan';

// Pure, deterministic building blocks for the demo supermarket, in the same spirit as
// pharmacy-plan.ts: everything random flows from a seeded RNG. The stock-movement planner and the
// checkout-duration helper are not shop-specific, so they are reused from pharmacy-plan.ts.
export { planStockMovements, checkoutMinutes } from './pharmacy-plan';
export type { StockSale, StockPlanItem, StockWriteOff, PlannedStockMovement } from './pharmacy-plan';

// ─── Business-day clock (Africa/Lagos, 08:00 → 22:00) ────────────────────────

/** The business day `now` belongs to. Closing is before midnight, so it's just the Lagos date. */
export function supermarketDayKey(now: Date): DayKey {
  return new Date(now.getTime() + LAGOS_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function supermarketOpeningTime(key: DayKey): Date {
  return atMinute(key, SUPERMARKET_OPEN_MINUTE);
}

export function supermarketClosingTime(key: DayKey): Date {
  return atMinute(key, SUPERMARKET_CLOSE_MINUTE);
}

function isoWeekdayIndex(key: DayKey): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// ─── Volume ──────────────────────────────────────────────────────────────────

/** Sales in a business day: weekday pattern, ±10% noise and a gentle upward trend over the history. */
export function supermarketOrderCount(key: DayKey, daysAgo: number): number {
  const noise = 0.9 + rngFor(`supermarket-count:${key}`)() * 0.2;
  const growth = 1 - 0.1 * Math.min(Math.max(daysAgo, 0), SUPERMARKET_HISTORY_DAYS) / SUPERMARKET_HISTORY_DAYS;
  return Math.round(SUPERMARKET_BASE_ORDERS_PER_DAY * SUPERMARKET_WEEKDAY_FACTORS[isoWeekdayIndex(key)] * growth * noise);
}

/** Share of a day's sales that should exist by `now` (0 before opening, 1 after closing). */
export function supermarketCumulativeShare(key: DayKey, now: Date): number {
  const elapsedMinutes = (now.getTime() - supermarketOpeningTime(key).getTime()) / 60_000;
  if (elapsedMinutes <= 0) return 0;
  const total = SUPERMARKET_HOURLY_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let hour = 0; hour < SUPERMARKET_HOURLY_WEIGHTS.length; hour++) {
    const intoHour = Math.min(Math.max(elapsedMinutes - hour * 60, 0), 60);
    acc += SUPERMARKET_HOURLY_WEIGHTS[hour] * (intoHour / 60);
  }
  return Math.min(acc / total, 1);
}

/** A random sale time within the business day, following the hourly curve. */
export function supermarketSaleTime(rng: Rng, key: DayKey): Date {
  const hour = weightedIndex(rng, SUPERMARKET_HOURLY_WEIGHTS);
  return atMinute(key, SUPERMARKET_OPEN_MINUTE + hour * 60 + rng() * 60);
}

// ─── Charges ─────────────────────────────────────────────────────────────────

/**
 * VAT on a subtotal, exactly as OrdersService.computeOrderCharges does it (percentage of the
 * subtotal, rounded to kobo) — the seeded history has to carry the same totals the live job's
 * real orders will.
 */
export function supermarketVat(subtotal: number): number {
  return SUPERMARKET_ORG_SETTINGS.vatEnabled
    ? Math.round(subtotal * (SUPERMARKET_ORG_SETTINGS.taxRate / 100) * 100) / 100
    : 0;
}

// ─── Baskets ─────────────────────────────────────────────────────────────────

export interface SupermarketBasketLine {
  name: string;
  price: number;
  quantity: number;
}

function lineQuantity(rng: Rng, price: number): number {
  const r = rng();
  if (price < 1000) return r < 0.4 ? 1 : r < 0.68 ? 2 : r < 0.86 ? 3 : randInt(rng, 4, 8);
  if (price < 3000) return r < 0.62 ? 1 : r < 0.86 ? 2 : r < 0.96 ? 3 : 4;
  if (price < 8000) return r < 0.85 ? 1 : 2;
  return r < 0.95 ? 1 : 2;
}

// Within a department the first items are the popular ones, and big-ticket items (a 10kg bag of
// rice, a carton of oil) sell far less often than their position alone would suggest.
function itemWeight(index: number, price: number): number {
  const priceFactor = price >= 15_000 ? 0.2 : price >= 8_000 ? 0.4 : price >= 5_000 ? 0.7 : 1;
  return priceFactor / Math.pow(index + 1, 0.8);
}

const DEPARTMENT_WEIGHTS = DEPARTMENTS.map((d) => d.weight);
const ITEM_WEIGHTS = DEPARTMENTS.map((d) => d.items.map(([, price], i) => itemWeight(i, price)));

// Lines per sale (1, 2, 3 …): a few top-up buys, mostly a basket of three to six, and the odd big shop.
const LINE_COUNT_WEIGHTS = [8, 12, 15, 16, 14, 11, 8, 6, 4, 3, 2, 1];

/** A plausible shopping basket — popular items in each department are picked far more often. */
export function planSupermarketBasket(rng: Rng): SupermarketBasketLine[] {
  const lineCount = 1 + weightedIndex(rng, LINE_COUNT_WEIGHTS);
  const lines = new Map<string, SupermarketBasketLine>();
  for (let i = 0; i < lineCount; i++) {
    const d = weightedIndex(rng, DEPARTMENT_WEIGHTS);
    const [name, price] = DEPARTMENTS[d].items[weightedIndex(rng, ITEM_WEIGHTS[d])];
    const quantity = lineQuantity(rng, price);
    const existing = lines.get(name);
    if (existing) existing.quantity += quantity;
    else lines.set(name, { name, price, quantity });
  }
  return [...lines.values()];
}

/** Customers with an on-account wallet sometimes pay from it; everyone else follows the shop's mix. */
export function pickSupermarketPaymentKind(rng: Rng, walletAllowed: boolean): PaymentKind {
  if (walletAllowed && rng() < 0.4) return 'WALLET';
  return SUPERMARKET_PAYMENT_MIX[weightedIndex(rng, SUPERMARKET_PAYMENT_MIX.map((p) => p.weight))].kind;
}
