import {
  BASE_ORDERS_PER_DAY,
  CLOSE_MINUTE,
  HISTORY_DAYS,
  HOURLY_WEIGHTS,
  LAGOS_UTC_OFFSET_MINUTES,
  MENU,
  OPEN_MINUTE,
  ORDER_TYPES,
  ORG_SETTINGS,
  PAYMENT_MIX,
  PaymentKind,
  TAKEAWAY_PACK_NAME,
  WEEKDAY_FACTORS,
} from './demo.constants';

// Pure, deterministic building blocks for the demo data generator. Everything random flows from a
// seeded RNG so the same business day always plans the same volume, and tests are repeatable.

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for fake data. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(key: string): Rng {
  return createRng(hashString(key));
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Index in [0, n) skewed towards 0 — the first entries of a list are the popular ones. */
export function zipfIndex(rng: Rng, n: number, exponent = 0.9): number {
  return weightedIndex(rng, Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, exponent)));
}

function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng();
  while (p > limit) {
    k++;
    p *= rng();
  }
  return k;
}

function logNormal(rng: Rng, median: number, sigma: number): number {
  // Box–Muller for a standard normal sample.
  const u = Math.max(rng(), 1e-9);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  return median * Math.exp(sigma * z);
}

// ─── Business-day clock (Africa/Lagos, 08:00 → 02:00) ────────────────────────

/** A business day, named by the calendar date it opens on, e.g. "2026-10-23". */
export type DayKey = string;

function lagosShifted(date: Date): Date {
  return new Date(date.getTime() + LAGOS_UTC_OFFSET_MINUTES * 60_000);
}

/** The business day `now` belongs to. Before 02:00 still counts as the previous day's service. */
export function businessDayKey(now: Date): DayKey {
  const local = lagosShifted(now);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < CLOSE_MINUTE - 24 * 60) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

export function addDays(key: DayKey, days: number): DayKey {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The instant `minute` minutes after Lagos midnight on `key` (may exceed 24h for after-midnight). */
export function atMinute(key: DayKey, minute: number): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) + (minute - LAGOS_UTC_OFFSET_MINUTES) * 60_000);
}

export function openingTime(key: DayKey): Date {
  return atMinute(key, OPEN_MINUTE);
}

export function closingTime(key: DayKey): Date {
  return atMinute(key, CLOSE_MINUTE);
}

/** Lagos calendar date of an instant, as stored in Payment.paymentDate (@db.Date). */
export function lagosDate(date: Date): Date {
  return new Date(`${lagosShifted(date).toISOString().slice(0, 10)}T00:00:00Z`);
}

function isoWeekdayIndex(key: DayKey): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// ─── Volume ──────────────────────────────────────────────────────────────────

/**
 * How many orders a business day gets. Weekday pattern, ±10% day-to-day noise, and a gentle
 * upward trend over the history window so trend charts read as a growing business.
 */
export function plannedOrderCount(key: DayKey, daysAgo: number): number {
  const noise = 0.9 + rngFor(`count:${key}`)() * 0.2;
  const growth = 1 - 0.12 * Math.min(Math.max(daysAgo, 0), HISTORY_DAYS) / HISTORY_DAYS;
  return Math.round(BASE_ORDERS_PER_DAY * WEEKDAY_FACTORS[isoWeekdayIndex(key)] * growth * noise);
}

/** Share of a day's orders that should exist by `now` (0 before opening, 1 after the last hour). */
export function cumulativeShare(key: DayKey, now: Date): number {
  const elapsedMinutes = (now.getTime() - openingTime(key).getTime()) / 60_000;
  if (elapsedMinutes <= 0) return 0;
  const total = HOURLY_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let hour = 0; hour < HOURLY_WEIGHTS.length; hour++) {
    const intoHour = Math.min(Math.max(elapsedMinutes - hour * 60, 0), 60);
    acc += HOURLY_WEIGHTS[hour] * (intoHour / 60);
  }
  return Math.min(acc / total, 1);
}

/** A random order time within the business day, following the hourly curve. */
export function sampleOrderTime(rng: Rng, key: DayKey): Date {
  const hour = weightedIndex(rng, HOURLY_WEIGHTS);
  return atMinute(key, OPEN_MINUTE + hour * 60 + rng() * 60);
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export function pickOrderType(rng: Rng): string {
  return ORDER_TYPES[weightedIndex(rng, ORDER_TYPES.map((t) => t.weight))].name;
}

export interface BasketLine {
  name: string;
  price: number;
  quantity: number;
}

const FOOD_CATEGORIES = MENU.filter((c) => c.kind === 'FOOD');
const DRINK_CATEGORIES = MENU.filter((c) => c.kind === 'DRINK');
const TAKEAWAY_PACK = MENU.flatMap((c) => c.items).find((i) => i.name === TAKEAWAY_PACK_NAME)!;

function lineQuantity(rng: Rng, categoryName: string): number {
  const r = rng();
  if (categoryName === 'Beer & Soft Drinks') return r < 0.55 ? 1 : r < 0.8 ? 2 : randInt(rng, 3, 6);
  return r < 0.82 ? 1 : r < 0.96 ? 2 : 3;
}

/**
 * A plausible basket for one order. Dine-in averages ~5 lines with drinks slightly ahead of food;
 * takeaway and delivery are smaller, food-led and always carry packaging.
 */
export function planBasket(rng: Rng, source: string): BasketLine[] {
  const isPacked = source === 'Takeaway' || source === 'Delivery';
  const lineCount = source === 'Private Dining' ? randInt(rng, 8, 14) : isPacked ? 1 + poisson(rng, 1.4) : 1 + poisson(rng, 3.8);
  const drinkShare = isPacked ? 0.3 : 0.55;

  const lines = new Map<string, BasketLine>();
  for (let i = 0; i < Math.min(lineCount, 14); i++) {
    const categories = rng() < drinkShare ? DRINK_CATEGORIES : FOOD_CATEGORIES;
    const category = categories[weightedIndex(rng, categories.map((c) => c.weight))];
    const item = category.items[zipfIndex(rng, category.items.length)];
    const quantity = lineQuantity(rng, category.name);
    const existing = lines.get(item.name);
    if (existing) existing.quantity += quantity;
    else lines.set(item.name, { name: item.name, price: item.price, quantity });
  }
  if (isPacked) {
    const packs = Math.max(1, Math.ceil([...lines.values()].filter((l) => l.price > 3000).length / 2));
    lines.set(TAKEAWAY_PACK.name, { name: TAKEAWAY_PACK.name, price: TAKEAWAY_PACK.price, quantity: packs });
  }
  return [...lines.values()];
}

export interface OrderCharges {
  subtotal: number;
  vatAmount: number;
  entertainmentTaxAmount: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
}

/** Same arithmetic as OrdersService.computeOrderCharges, with every charge applied. */
export function computeCharges(subtotal: number): OrderCharges {
  const round = (v: number) => Math.round(v * 100) / 100;
  const vatAmount = round(subtotal * (ORG_SETTINGS.taxRate / 100));
  const entertainmentTaxAmount = round(subtotal * (ORG_SETTINGS.entertainmentTaxRate / 100));
  const serviceChargeAmount = round(subtotal * (ORG_SETTINGS.serviceChargeRate / 100));
  const taxAmount = vatAmount + entertainmentTaxAmount;
  return { subtotal, vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount, total: subtotal + taxAmount + serviceChargeAmount };
}

/** Minutes between an order being placed and paid. */
export function dwellMinutes(rng: Rng, source: string): number {
  if (source === 'Takeaway') return randInt(rng, 8, 30);
  if (source === 'Delivery') return randInt(rng, 15, 45);
  return Math.round(Math.min(Math.max(logNormal(rng, 70, 0.55), 15), 240));
}

/**
 * Customers with a wallet mostly pay from it (that's why they have one); everyone else pays by
 * the restaurant-wide mix.
 */
export function pickPaymentKind(rng: Rng, walletAllowed: boolean): PaymentKind {
  if (walletAllowed && rng() < 0.45) return 'WALLET';
  const options = PAYMENT_MIX.filter((p) => p.kind !== 'WALLET');
  return options[weightedIndex(rng, options.map((p) => p.weight))].kind;
}

// Fake but realistically shaped Moniepoint references. The account number is invented.
const DEMO_SETTLEMENT_ACCOUNT = '5038172946';

function digits(rng: Rng, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += Math.floor(rng() * 10);
  return out;
}

export function moniepointReference(rng: Rng, kind: 'AUTO_TRANSFER' | 'AUTO_POS', at: Date): string {
  if (kind === 'AUTO_TRANSFER') return `AP_TRSF|${DEMO_SETTLEMENT_ACCOUNT}|${digits(rng, 19)}`;
  const ymd = lagosShifted(at).toISOString().slice(0, 10).replace(/-/g, '');
  return `PUR|${ymd}${digits(rng, 13)}MP1DMO${digits(rng, 18)}`;
}
