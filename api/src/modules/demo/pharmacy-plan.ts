import { LAGOS_UTC_OFFSET_MINUTES, PaymentKind } from './demo.constants';
import {
  DEPARTMENTS,
  PHARMACY_BASE_ORDERS_PER_DAY,
  PHARMACY_CLOSE_MINUTE,
  PHARMACY_HISTORY_DAYS,
  PHARMACY_HOURLY_WEIGHTS,
  PHARMACY_OPEN_MINUTE,
  PHARMACY_PAYMENT_MIX,
  PHARMACY_WEEKDAY_FACTORS,
} from './pharmacy.constants';
import { DayKey, Rng, addDays, atMinute, hashString, randInt, rngFor, weightedIndex } from './demo-plan';

// Pure, deterministic building blocks for the demo pharmacy, in the same spirit as demo-plan.ts
// (which the restaurant demo uses): everything random flows from a seeded RNG.

// ─── Business-day clock (Africa/Lagos, 08:00 → 22:00) ────────────────────────

/** The business day `now` belongs to. Closing is before midnight, so it's just the Lagos date. */
export function pharmacyDayKey(now: Date): DayKey {
  return new Date(now.getTime() + LAGOS_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function pharmacyOpeningTime(key: DayKey): Date {
  return atMinute(key, PHARMACY_OPEN_MINUTE);
}

export function pharmacyClosingTime(key: DayKey): Date {
  return atMinute(key, PHARMACY_CLOSE_MINUTE);
}

function isoWeekdayIndex(key: DayKey): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// ─── Volume ──────────────────────────────────────────────────────────────────

/** Sales in a business day: weekday pattern, ±10% noise and a gentle upward trend over the history. */
export function pharmacyOrderCount(key: DayKey, daysAgo: number): number {
  const noise = 0.9 + rngFor(`pharmacy-count:${key}`)() * 0.2;
  const growth = 1 - 0.1 * Math.min(Math.max(daysAgo, 0), PHARMACY_HISTORY_DAYS) / PHARMACY_HISTORY_DAYS;
  return Math.round(PHARMACY_BASE_ORDERS_PER_DAY * PHARMACY_WEEKDAY_FACTORS[isoWeekdayIndex(key)] * growth * noise);
}

/** Share of a day's sales that should exist by `now` (0 before opening, 1 after closing). */
export function pharmacyCumulativeShare(key: DayKey, now: Date): number {
  const elapsedMinutes = (now.getTime() - pharmacyOpeningTime(key).getTime()) / 60_000;
  if (elapsedMinutes <= 0) return 0;
  const total = PHARMACY_HOURLY_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let hour = 0; hour < PHARMACY_HOURLY_WEIGHTS.length; hour++) {
    const intoHour = Math.min(Math.max(elapsedMinutes - hour * 60, 0), 60);
    acc += PHARMACY_HOURLY_WEIGHTS[hour] * (intoHour / 60);
  }
  return Math.min(acc / total, 1);
}

/** A random sale time within the business day, following the hourly curve. */
export function pharmacySaleTime(rng: Rng, key: DayKey): Date {
  const hour = weightedIndex(rng, PHARMACY_HOURLY_WEIGHTS);
  return atMinute(key, PHARMACY_OPEN_MINUTE + hour * 60 + rng() * 60);
}

/** Minutes between a sale being rung up and paid — retail checkout is scan, pay, done. */
export function checkoutMinutes(rng: Rng): number {
  return randInt(rng, 1, 4);
}

// ─── Baskets ─────────────────────────────────────────────────────────────────

export interface PharmacyBasketLine {
  name: string;
  price: number;
  quantity: number;
}

function lineQuantity(rng: Rng, price: number): number {
  const r = rng();
  if (price < 1000) return r < 0.45 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : randInt(rng, 4, 6);
  if (price < 2500) return r < 0.65 ? 1 : r < 0.88 ? 2 : 3;
  return r < 0.92 ? 1 : 2;
}

// Within a department the first items are the popular ones, and big-ticket items (monitors,
// glucometers, formula) sell far less often than their position alone would suggest.
function itemWeight(index: number, price: number): number {
  const priceFactor = price >= 20_000 ? 0.15 : price >= 10_000 ? 0.3 : price >= 5_000 ? 0.6 : 1;
  return priceFactor / Math.pow(index + 1, 0.9);
}

const DEPARTMENT_WEIGHTS = DEPARTMENTS.map((d) => d.weight);
const ITEM_WEIGHTS = DEPARTMENTS.map((d) => d.items.map(([, price], i) => itemWeight(i, price)));

// Lines per sale: mostly one or two items, occasionally a full shopping basket.
const LINE_COUNT_WEIGHTS = [42, 30, 16, 8, 4];

/** A plausible basket for one sale — popular items in each department are picked far more often. */
export function planPharmacyBasket(rng: Rng): PharmacyBasketLine[] {
  const lineCount = 1 + weightedIndex(rng, LINE_COUNT_WEIGHTS);
  const lines = new Map<string, PharmacyBasketLine>();
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

/** Customers with an on-account wallet mostly pay from it; everyone else follows the shop's mix. */
export function pickPharmacyPaymentKind(rng: Rng, walletAllowed: boolean): PaymentKind {
  if (walletAllowed && rng() < 0.45) return 'WALLET';
  return PHARMACY_PAYMENT_MIX[weightedIndex(rng, PHARMACY_PAYMENT_MIX.map((p) => p.weight))].kind;
}

// ─── Stock movements ─────────────────────────────────────────────────────────

export interface StockSale {
  itemId: string;
  at: Date;
  quantity: number;
  orderId: string;
}

export interface StockPlanItem {
  id: string;
  name: string;
  /** On-hand after the last event — what the inventory screen shows. */
  finalOnHand: number;
  /** Supplier deliveries stop for the last ~12 days, so the item is still short when the demo is shown. */
  lowStock: boolean;
}

export interface StockWriteOff {
  itemId: string;
  quantity: number;
  at: Date;
  notes: string;
}

export interface PlannedStockMovement {
  itemId: string;
  type: 'ORDER_DEDUCTED' | 'RESTOCK' | 'ADJUSTMENT';
  /** Signed, as StockMovement.quantity is stored: sales and write-offs are negative. */
  quantity: number;
  onHandBefore: number;
  onHandAfter: number;
  at: Date;
  orderId?: string;
  notes?: string;
}

const RESTOCK_MINUTE = 7 * 60 + 30;
const LOW_STOCK_QUIET_DAYS = 12;

interface DraftEvent {
  type: PlannedStockMovement['type'];
  /** Magnitude of the change in on-hand (always positive). */
  amount: number;
  at: Date;
  orderId?: string;
  notes?: string;
}

/**
 * Builds a consistent stock-movement history for the recent window, ending at each item's final
 * on-hand. It works backwards from that final figure: every sale and write-off adds back what it
 * removed, and each weekly or fortnightly supplier delivery (sized to cover the sales that follow
 * it) takes back what it added — so on-hand never dips below zero and the numbers on screen line
 * up with the order history exactly.
 */
export function planStockMovements(
  items: StockPlanItem[],
  sales: StockSale[],
  writeOffs: StockWriteOff[],
  now: Date,
  windowDays: number,
): PlannedStockMovement[] {
  const todayKey = pharmacyDayKey(now);
  const windowStart = atMinute(addDays(todayKey, -windowDays), 0);
  const salesByItem = new Map<string, StockSale[]>();
  for (const sale of sales) {
    if (sale.at < windowStart) continue;
    const list = salesByItem.get(sale.itemId) ?? [];
    list.push(sale);
    salesByItem.set(sale.itemId, list);
  }
  const writeOffsByItem = new Map<string, StockWriteOff[]>();
  for (const w of writeOffs) writeOffsByItem.set(w.itemId, [...(writeOffsByItem.get(w.itemId) ?? []), w]);

  const out: PlannedStockMovement[] = [];
  for (const item of items) {
    const itemSales = (salesByItem.get(item.id) ?? []).sort((a, b) => a.at.getTime() - b.at.getTime());
    const itemWriteOffs = writeOffsByItem.get(item.id) ?? [];
    if (itemSales.length === 0 && itemWriteOffs.length === 0) continue;

    const events: DraftEvent[] = [
      ...itemSales.map((s) => ({ type: 'ORDER_DEDUCTED' as const, amount: s.quantity, at: s.at, orderId: s.orderId })),
      ...itemWriteOffs.map((w) => ({ type: 'ADJUSTMENT' as const, amount: w.quantity, at: w.at, notes: w.notes })),
    ];

    const totalSold = itemSales.reduce((sum, s) => sum + s.quantity, 0);
    const cycle = totalSold >= 60 ? 7 : 14;
    const step = totalSold >= 40 ? 10 : totalSold >= 12 ? 5 : 1;
    const phase = hashString(item.name) % cycle;
    const quietFrom = now.getTime() - LOW_STOCK_QUIET_DAYS * 24 * 60 * 60_000;

    const deliveries: Date[] = [];
    for (let offset = windowDays; offset >= 0; offset--) {
      if ((windowDays - offset) % cycle !== phase) continue;
      const at = atMinute(addDays(todayKey, -offset), RESTOCK_MINUTE);
      if (at >= now || at < windowStart) continue;
      if (item.lowStock && at.getTime() >= quietFrom) continue;
      deliveries.push(at);
    }
    deliveries.forEach((at, i) => {
      const until = deliveries[i + 1]?.getTime() ?? Infinity;
      const demand = itemSales.filter((s) => s.at >= at && s.at.getTime() < until).reduce((sum, s) => sum + s.quantity, 0);
      const amount = Math.ceil(demand / step) * step;
      if (amount > 0) events.push({ type: 'RESTOCK', amount, at, notes: 'Supplier delivery' });
    });

    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    let level = item.finalOnHand;
    const planned: PlannedStockMovement[] = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      let amount = e.amount;
      let before: number;
      if (e.type === 'RESTOCK') {
        // A delivery can't have arrived into negative stock; trim it rather than break the chain.
        amount = Math.min(amount, level);
        if (amount <= 0) continue;
        before = level - amount;
      } else {
        before = level + amount;
      }
      planned.push({
        itemId: item.id,
        type: e.type,
        quantity: e.type === 'RESTOCK' ? amount : -amount,
        onHandBefore: before,
        onHandAfter: level,
        at: e.at,
        orderId: e.orderId,
        notes: e.notes,
      });
      level = before;
    }
    out.push(...planned.reverse());
  }
  return out;
}
