/**
 * Pure aggregation for the POS sales report — no database access, so the arithmetic (shares,
 * roll-ups, dayparts, top/bottom lists) is unit-testable on plain objects. SalesReportService
 * loads the rows and hands them here.
 *
 * Definitions (shared with anything else that wants to call a number "sales"):
 * - An order counts once it is CLOSED_PAID, on its closedAt. Dayparts bucket it by when it was
 *   placed instead, so a tab paid at closing time still shows when the guests were in.
 * - Gross sales = sum of order-line amounts (menu price × quantity), before order discounts,
 *   excluding tax and service charge.
 * - Discounts = sum of order-level discountAmount on those orders.
 * - Net sales = gross − discounts.
 * - Voids = CANCELLED orders placed in the period, valued at their line amounts. They were never
 *   in gross, so they are reported beside it, not deducted from it.
 */

export type DepartmentKey = "FOOD" | "DRINK" | "OTHER" | "STORE";

export const DEPARTMENT_NAMES: Record<DepartmentKey, string> = {
  FOOD: "Kitchen",
  DRINK: "Bar",
  OTHER: "Other",
  STORE: "Store",
};

const DEPARTMENT_ORDER: DepartmentKey[] = ["FOOD", "DRINK", "STORE", "OTHER"];

export interface Daypart {
  name: string;
  /** Shown only when it has orders, e.g. sales outside an evening venue's opening hours. */
  optional?: boolean;
  /** "HH:mm", inclusive */
  start: string;
  /** "HH:mm", exclusive; may be earlier than start when the daypart crosses midnight */
  end: string;
}

export const DEFAULT_DAYPARTS: Daypart[] = [
  { name: "Breakfast", start: "06:00", end: "11:00" },
  { name: "Lunch", start: "11:00", end: "15:00" },
  { name: "Afternoon", start: "15:00", end: "18:00" },
  { name: "Evening", start: "18:00", end: "22:00" },
  { name: "Late", start: "22:00", end: "06:00" },
];

const hhmm = (minute: number) => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Dayparts for an org's opening hours. Breakfast-to-late fits any business open through the day.
 * An evening venue (opening at 15:00 or later and closing after midnight) would get three empty
 * daytime rows and one huge "Late" row from that, so its opening hours are split into four
 * slots of whole hours instead, plus an "Outside opening hours" row for any stray sales.
 */
export function daypartsForShift(shift: {
  shiftStartTime: string;
  shiftEndTime: string;
}): Daypart[] {
  const open = minutesOf(shift.shiftStartTime);
  // Shift end times are inclusive ("05:59"), so the venue closes on the next minute.
  const close = minutesOf(shift.shiftEndTime) + 1;
  const overnight = close <= open;
  if (!overnight || open < 15 * 60) return DEFAULT_DAYPARTS;

  const openHour = Math.floor(open / 60) * 60;
  const span = close + 1440 - openHour;
  const hours = Math.ceil(span / 60);
  const slots = 4;
  const bounds = Array.from(
    { length: slots + 1 },
    (_, i) => openHour + Math.round((hours * i) / slots) * 60,
  );
  const names = ["Opening", "Early night", "Late night", "Closing"];
  return [
    ...names.map((name, i) => ({
      name,
      start: hhmm(bounds[i]),
      end: hhmm(bounds[i + 1]),
    })),
    {
      name: "Outside opening hours",
      start: hhmm(bounds[slots]),
      end: hhmm(openHour),
      optional: true,
    },
  ];
}

/** One order line, already resolved to the item, category and department it reports under. */
export interface ReportLine {
  itemKey: string;
  itemName: string;
  category: string;
  department: DepartmentKey;
  quantity: number;
  amount: number;
}

export interface ReportOrder {
  /** When the order was opened — dayparts use this, since tabs are often paid long after ordering. */
  placedAt: Date;
  orderType: string;
  staffId: string | null;
  discountAmount: number;
  lines: ReportLine[];
  payments: Array<{ method: string; amount: number }>;
}

export interface VoidedOrder {
  staffId: string | null;
  amount: number;
}

/** An item on sale in the period, used to count items that sold nothing. */
export interface CatalogItem {
  itemKey: string;
  department: DepartmentKey;
}

export interface BuildInput {
  orders: ReportOrder[];
  voids: VoidedOrder[];
  catalog: CatalogItem[];
  staffNames: Map<string, string>;
  dayparts?: Daypart[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) =>
  whole > 0 ? round2((part / whole) * 100) : 0;
const avg = (total: number, count: number) =>
  count > 0 ? round2(total / count) : 0;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function inDaypart(minute: number, d: Daypart): boolean {
  const start = minutesOf(d.start);
  const end = minutesOf(d.end);
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

interface ItemTotal {
  name: string;
  quantity: number;
  revenue: number;
}

export function buildSalesReport({
  orders,
  voids,
  catalog,
  staffNames,
  dayparts = DEFAULT_DAYPARTS,
}: BuildInput) {
  let grossSales = 0;
  let discounts = 0;
  let discountCount = 0;
  let itemsSold = 0;

  const departments = new Map<
    DepartmentKey,
    { categories: Map<string, ItemTotal>; items: Map<string, ItemTotal> }
  >();
  const daypartTotals = dayparts.map(() => ({ orders: 0, sales: 0 }));
  const orderTypes = new Map<string, { orders: number; sales: number }>();
  const payments = new Map<string, number>();
  const staff = new Map<
    string,
    {
      orders: number;
      sales: number;
      voids: number;
      voidAmount: number;
      discounts: number;
    }
  >();
  const staffRow = (id: string | null) => {
    const key = id ?? "unassigned";
    let row = staff.get(key);
    if (!row)
      staff.set(
        key,
        (row = { orders: 0, sales: 0, voids: 0, voidAmount: 0, discounts: 0 }),
      );
    return row;
  };

  for (const order of orders) {
    let orderSales = 0;
    for (const line of order.lines) {
      let dept = departments.get(line.department);
      if (!dept)
        departments.set(
          line.department,
          (dept = { categories: new Map(), items: new Map() }),
        );
      const cat = dept.categories.get(line.category) ?? {
        name: line.category,
        quantity: 0,
        revenue: 0,
      };
      cat.quantity += line.quantity;
      cat.revenue += line.amount;
      dept.categories.set(line.category, cat);
      const item = dept.items.get(line.itemKey) ?? {
        name: line.itemName,
        quantity: 0,
        revenue: 0,
      };
      item.quantity += line.quantity;
      item.revenue += line.amount;
      dept.items.set(line.itemKey, item);

      orderSales += line.amount;
      itemsSold += line.quantity;
    }
    grossSales += orderSales;
    discounts += order.discountAmount;
    if (order.discountAmount > 0) discountCount += 1;

    const minute = order.placedAt.getHours() * 60 + order.placedAt.getMinutes();
    const dp = dayparts.findIndex((d) => inDaypart(minute, d));
    if (dp >= 0) {
      daypartTotals[dp].orders += 1;
      daypartTotals[dp].sales += orderSales;
    }

    const type = orderTypes.get(order.orderType) ?? { orders: 0, sales: 0 };
    type.orders += 1;
    type.sales += orderSales;
    orderTypes.set(order.orderType, type);

    for (const p of order.payments)
      payments.set(p.method, (payments.get(p.method) ?? 0) + p.amount);

    const s = staffRow(order.staffId);
    s.orders += 1;
    s.sales += orderSales;
    s.discounts += order.discountAmount;
  }

  let voidAmount = 0;
  for (const v of voids) {
    voidAmount += v.amount;
    const s = staffRow(v.staffId);
    s.voids += 1;
    s.voidAmount += v.amount;
  }

  const orderCount = orders.length;
  const soldKeys = new Set<string>();
  for (const dept of departments.values())
    for (const key of dept.items.keys()) soldKeys.add(key);
  const zeroSales = new Map<DepartmentKey, number>();
  for (const item of catalog) {
    if (!soldKeys.has(item.itemKey))
      zeroSales.set(item.department, (zeroSales.get(item.department) ?? 0) + 1);
  }

  const toRow = (t: ItemTotal) => ({
    name: t.name,
    quantity: round2(t.quantity),
    revenue: round2(t.revenue),
    quantityPercent: pct(t.quantity, itemsSold),
    revenuePercent: pct(t.revenue, grossSales),
    avgPrice: avg(t.revenue, t.quantity),
  });
  const byRevenue = (a: ItemTotal, b: ItemTotal) =>
    b.revenue - a.revenue || a.name.localeCompare(b.name);

  const departmentRows = [...departments.entries()]
    .map(([key, dept]) => {
      const items = [...dept.items.values()].sort(byRevenue);
      const totals = items.reduce(
        (acc, i) => ({
          ...acc,
          quantity: acc.quantity + i.quantity,
          revenue: acc.revenue + i.revenue,
        }),
        {
          name: DEPARTMENT_NAMES[key],
          quantity: 0,
          revenue: 0,
        },
      );
      const top = items.slice(0, 5);
      // Bottom 5 never repeats a top-5 item, so a department with few items shows a short list.
      const bottom = items.slice(5).slice(-5).reverse();
      const item = (i: ItemTotal) => ({
        name: i.name,
        quantity: round2(i.quantity),
        revenue: round2(i.revenue),
      });
      return {
        key,
        ...toRow(totals),
        categories: [...dept.categories.values()].sort(byRevenue).map(toRow),
        topItems: top.map(item),
        bottomItems: bottom.map(item),
        zeroSalesCount: zeroSales.get(key) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        DEPARTMENT_ORDER.indexOf(a.key) - DEPARTMENT_ORDER.indexOf(b.key),
    );

  const paymentsTotal = [...payments.values()].reduce((a, b) => a + b, 0);

  return {
    headline: {
      grossSales: round2(grossSales),
      discounts: round2(discounts),
      netSales: round2(grossSales - discounts),
      orders: orderCount,
      avgCheck: avg(grossSales, orderCount),
      itemsSold: round2(itemsSold),
      itemsPerOrder: avg(itemsSold, orderCount),
    },
    departments: departmentRows,
    totals: {
      quantity: round2(itemsSold),
      revenue: round2(grossSales),
      avgPrice: avg(grossSales, itemsSold),
    },
    dayparts: dayparts
      .map((d, i) => ({
        ...d,
        orders: daypartTotals[i].orders,
        sales: round2(daypartTotals[i].sales),
        salesPercent: pct(daypartTotals[i].sales, grossSales),
        avgCheck: avg(daypartTotals[i].sales, daypartTotals[i].orders),
      }))
      .filter((d) => !d.optional || d.orders > 0),
    orderTypes: [...orderTypes.entries()]
      .map(([name, t]) => ({
        name,
        orders: t.orders,
        sales: round2(t.sales),
        salesPercent: pct(t.sales, grossSales),
      }))
      .sort((a, b) => b.sales - a.sales),
    payments: {
      total: round2(paymentsTotal),
      methods: [...payments.entries()]
        .map(([method, amount]) => ({
          method,
          amount: round2(amount),
          percent: pct(amount, paymentsTotal),
        }))
        .sort((a, b) => b.amount - a.amount),
    },
    staff: [...staff.entries()]
      .map(([id, s]) => ({
        id: id === "unassigned" ? null : id,
        name:
          id === "unassigned"
            ? "Unassigned"
            : (staffNames.get(id) ?? "Former staff"),
        orders: s.orders,
        sales: round2(s.sales),
        avgCheck: avg(s.sales, s.orders),
        voids: s.voids,
        voidAmount: round2(s.voidAmount),
        discounts: round2(s.discounts),
      }))
      .sort((a, b) => b.sales - a.sales || b.voids - a.voids),
    controls: {
      voids: {
        amount: round2(voidAmount),
        count: voids.length,
        percentOfSales: pct(voidAmount, grossSales),
      },
      discounts: { amount: round2(discounts), count: discountCount },
    },
  };
}

export type SalesReportBody = ReturnType<typeof buildSalesReport>;
