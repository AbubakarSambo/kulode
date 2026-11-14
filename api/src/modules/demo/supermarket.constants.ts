import { VatCategory } from '@prisma/client';

// Everything here is invented for sales demos of the RETAIL POS mode in a multi-lane supermarket.
// The shop, its staff and its customers are fictional; product names are ordinary Nigerian-market
// grocery brands (as the restaurant and pharmacy demos use real brands), priced to look right, not
// to be quoted. Barcodes are in the EAN-13 "in-store use" range (prefix 2), so they can never
// collide with a real product's code.

export const SUPERMARKET_ORG_NAME = 'Baobab Fresh Supermarket Gwarinpa';
export const SUPERMARKET_ORG_SLUG = 'baobab-fresh-supermarket-demo';
export const SUPERMARKET_ADMIN_EMAIL = 'baobab.demo@tarione.com';
// Different domain from the other demos' staff so the orgs' logins can never collide.
export const SUPERMARKET_STAFF_EMAIL_DOMAIN = 'supermarket.demo.tarione.com';

// Business day runs 08:00 → 22:00 the same calendar day (Lagos is UTC+1 all year).
export const SUPERMARKET_OPEN_MINUTE = 8 * 60;
export const SUPERMARKET_CLOSE_MINUTE = 22 * 60;
export const SUPERMARKET_SHIFT_START_TIME = '08:00';
export const SUPERMARKET_SHIFT_END_TIME = '22:00';

export const SUPERMARKET_HISTORY_DAYS = 90;
export const SUPERMARKET_RETENTION_DAYS = 120;
// Stock movements are only written for this many recent days — a supermarket basket has many
// lines, so a shorter window than the pharmacy keeps a reset's row count comparable.
export const SUPERMARKET_STOCK_WINDOW_DAYS = 21;
export const SUPERMARKET_BASE_ORDERS_PER_DAY = 95;

// Relative share of sales in each hour from 08:00 (index 0) to 21:00 (index 13): a lunchtime
// bump, then the after-work rush from 17:00 to 19:00.
export const SUPERMARKET_HOURLY_WEIGHTS = [2.5, 4, 5, 5.5, 5, 4.5, 4, 4.5, 6, 8.5, 9, 8, 5.5, 3];

// Index = ISO weekday - 1 (Mon..Sun). Weekend is the big shop.
export const SUPERMARKET_WEEKDAY_FACTORS = [0.95, 0.9, 0.92, 0.95, 1.1, 1.35, 1.15];

// The order maths only has an org-wide VAT switch, so VAT is on for the whole shop (7.5%). Items
// are still seeded with their real category (basic foods are exempt) for the catalogue screens.
export const SUPERMARKET_ORG_SETTINGS = {
  taxRate: 7.5,
  vatEnabled: true,
  entertainmentTaxRate: 0,
  entertainmentTaxEnabled: false,
  serviceChargeRate: 0,
  serviceChargeEnabled: false,
};

// The one order type a retail org has (see OrderTypesService.seedDefaults).
export const SUPERMARKET_ORDER_TYPE = 'Retail Sale';

export interface SupermarketProduct {
  name: string;
  barcode: string;
  sku: string;
  department: string;
  vatCategory: VatCategory;
  /** Shelf price (InventoryItem.sellPrice). */
  price: number;
  /** What the shop pays its supplier (InventoryItem.unitPrice). */
  cost: number;
  /** On-hand after the seeded history, i.e. what the inventory screen shows right after a reset. */
  onHand: number;
  reorderLevel: number;
}

export interface SupermarketDepartment {
  name: string;
  code: string;
  vatCategory: VatCategory;
  /** How often a basket line lands in this department. */
  weight: number;
  /** [name, sell price, cost, on hand, reorder level, optional per-item VAT override] — most popular first. */
  items: [string, number, number, number, number, VatCategory?][];
}

export const DEPARTMENTS: SupermarketDepartment[] = [
  {
    name: 'Groceries & Staples',
    code: 'STP',
    vatCategory: 'STANDARD',
    weight: 20,
    items: [
      ['Indomie Chicken Noodles 70g', 380, 290, 960, 300],
      ['Indomie Onion Chicken 70g', 380, 290, 480, 150],
      ['Indomie Super Pack 120g', 650, 500, 300, 100],
      ['Golden Penny Spaghetti 500g', 1900, 1500, 160, 60],
      ['Golden Penny Macaroni 500g', 1900, 1500, 120, 40],
      ['Mama Gold Parboiled Rice 5kg', 9800, 8300, 70, 25, 'EXEMPT'],
      ['Royal Stallion Rice 10kg', 19500, 17000, 40, 15, 'EXEMPT'],
      ['Honey Beans (Oloyin) 1kg', 3300, 2700, 90, 30, 'EXEMPT'],
      ['Garri White 1kg', 1800, 1400, 120, 40, 'EXEMPT'],
      ['Golden Penny Semovita 1kg', 2700, 2200, 80, 30],
      ['Golden Penny Flour 1kg', 2500, 2000, 70, 25, 'EXEMPT'],
      ['Dangote Sugar 1kg', 2800, 2300, 150, 50],
      ['Dangote Salt 500g', 700, 480, 140, 40],
      ['Kings Vegetable Oil 5L', 17800, 15200, 36, 12, 'EXEMPT'],
      ['Power Oil Vegetable Oil 1L', 3900, 3200, 90, 30, 'EXEMPT'],
      ['Gino Tomato Paste 70g', 400, 290, 300, 100],
      ['Gino Tomato Paste 400g Tin', 2900, 2300, 60, 20],
      ['Maggi Star Seasoning Cubes (Pack of 50)', 1500, 1150, 110, 40],
      ['Titus Sardine 125g Tin', 1700, 1350, 100, 35],
      ['Geisha Mackerel 155g Tin', 2300, 1850, 60, 20],
      ['Exeter Corned Beef 340g Tin', 6500, 5300, 4, 12],
    ],
  },
  {
    name: 'Beverages',
    code: 'BEV',
    vatCategory: 'STANDARD',
    weight: 16,
    items: [
      ['Coca-Cola 50cl', 500, 360, 480, 150],
      ['Fanta Orange 50cl', 500, 360, 360, 120],
      ['Sprite 50cl', 500, 360, 300, 100],
      ['Pepsi 50cl', 500, 360, 200, 80],
      ['Eva Table Water 75cl', 350, 230, 600, 200],
      ['Nestle Pure Life Water 1.5L', 600, 420, 240, 80],
      ['Coca-Cola 1.5L', 1300, 950, 120, 40],
      ['Malta Guinness 33cl Can', 750, 560, 180, 60],
      ['Maltina 33cl Can', 750, 560, 150, 50],
      ['Chivita 100% Orange Juice 1L', 2500, 1900, 70, 25],
      ['Five Alive Pulpy Orange 1L', 1800, 1400, 60, 20],
      ['Hollandia Yoghurt Strawberry 1L', 3300, 2650, 14, 16],
      ['Peak Milk Tin 400g', 5900, 4900, 80, 30, 'EXEMPT'],
      ['Dano Milk Powder 400g', 5600, 4600, 40, 15, 'EXEMPT'],
      ['Milo Tin 400g', 5000, 4100, 70, 25],
      ['Bournvita 450g Tin', 4400, 3600, 40, 15],
      ['Nescafe Classic 50g', 3900, 3100, 36, 12],
      ['Lipton Yellow Label Tea (25 Bags)', 1900, 1450, 60, 20],
    ],
  },
  {
    name: 'Breakfast & Bakery',
    code: 'BRK',
    vatCategory: 'STANDARD',
    weight: 9,
    items: [
      ['Sliced Bread (Large Loaf)', 2000, 1500, 60, 25, 'EXEMPT'],
      ['Golden Morn Cereal 500g', 3300, 2650, 50, 18],
      ['Quaker Oats 500g', 3500, 2800, 40, 15],
      ["Kellogg's Corn Flakes 375g", 4300, 3500, 30, 12],
      ['Peanut Butter 340g', 3100, 2400, 36, 12],
      ['Blue Band Margarine 450g', 2700, 2150, 50, 18],
      ['Cream Crackers 200g', 1500, 1100, 70, 25],
      ["McVitie's Digestive Biscuits 400g", 3300, 2600, 40, 15],
      ['Weetabix 430g', 4600, 3700, 9, 10],
      ['Honey 500g', 4800, 3800, 20, 8],
      ['Eggs (Crate of 30)', 6800, 5800, 5, 12, 'EXEMPT'],
    ],
  },
  {
    name: 'Fresh Produce',
    code: 'FRS',
    vatCategory: 'EXEMPT',
    weight: 8,
    items: [
      ['Tomatoes (Small Basket)', 3500, 2700, 40, 15],
      ['Onions 1kg', 1600, 1200, 60, 20],
      ['Fresh Pepper (Tatashe) Pack', 1300, 900, 40, 15],
      ['Irish Potatoes 1kg', 2400, 1800, 50, 18],
      ['Carrots 500g', 1300, 900, 36, 12],
      ['Cabbage (Medium)', 1500, 1100, 24, 8],
      ['Plantain (Bunch of 4)', 2200, 1600, 30, 10],
      ['Bananas (Hand)', 1500, 1000, 30, 10],
      ['Pineapple (Each)', 1800, 1300, 20, 8],
      ['Watermelon (Half)', 2500, 1800, 14, 6],
    ],
  },
  {
    name: 'Frozen & Dairy',
    code: 'FRZ',
    vatCategory: 'STANDARD',
    weight: 7,
    items: [
      ['Frozen Chicken (Whole, ~1.2kg)', 9200, 7800, 30, 12],
      ['Chicken Laps 1kg', 7200, 6000, 36, 12],
      ['Turkey Wings 1kg', 9800, 8300, 24, 10],
      ['Titus Fish (Frozen) 1kg', 6500, 5300, 30, 10],
      ['Beef (Boneless) 1kg', 9000, 7500, 20, 8],
      ['Hollandia Yoghurt Natural 500ml', 2000, 1550, 40, 14],
      ['Cheddar Cheese 200g', 4200, 3300, 20, 8],
      ['Ice Cream Tub 1L', 4500, 3500, 16, 6],
    ],
  },
  {
    name: 'Snacks & Confectionery',
    code: 'SNK',
    vatCategory: 'STANDARD',
    weight: 10,
    items: [
      ['Cadbury Dairy Milk 90g', 2600, 2000, 60, 20],
      ['Oreo Biscuits (Pack)', 700, 500, 90, 30],
      ["Lay's Classic 70g", 1300, 950, 70, 25],
      ['Pringles Original 165g', 4200, 3300, 30, 10],
      ['Kinder Joy 20g', 1600, 1200, 50, 18],
      ['Mentos Roll', 300, 200, 150, 50],
      ['Chin Chin (Pack)', 900, 600, 60, 20],
      ['Planters Dry Roasted Peanuts 150g', 1800, 1350, 30, 10],
      ['Gala Sausage Roll', 500, 350, 80, 30],
      ['Trident Bubble Gum (Pack)', 600, 420, 70, 25],
    ],
  },
  {
    name: 'Household & Cleaning',
    code: 'HSE',
    vatCategory: 'STANDARD',
    weight: 9,
    items: [
      ['Omo Detergent 900g', 3000, 2400, 60, 20],
      ['Ariel Detergent 1kg', 3600, 2900, 36, 12],
      ['Morning Fresh Dish Wash 400ml', 2400, 1850, 40, 15],
      ['Harpic Toilet Cleaner 500ml', 3300, 2600, 30, 10],
      ['Jik Bleach 750ml', 2600, 2000, 36, 12],
      ['Izal Disinfectant 1L', 3600, 2800, 8, 8],
      ['Dettol Multi-Surface Cleaner 500ml', 4400, 3500, 20, 8],
      ['Toilet Roll (Pack of 10)', 6500, 5200, 40, 14],
      ['Kitchen Foil 10m', 2800, 2100, 24, 8],
      ['Refuse Bags (Pack of 20)', 1800, 1300, 36, 12],
      ['Raid Insecticide 300ml', 4400, 3500, 24, 8],
      ['Scouring Sponge (Pack of 3)', 900, 600, 50, 18],
      ['Matches (Pack of 10)', 500, 350, 70, 25],
    ],
  },
  {
    name: 'Personal Care',
    code: 'PC',
    vatCategory: 'STANDARD',
    weight: 8,
    items: [
      ['Colgate Total Toothpaste 120g', 2400, 1850, 60, 20],
      ['Oral-B Toothbrush', 1300, 900, 50, 20],
      ['Dettol Original Soap (Pack of 3)', 2600, 2000, 50, 20],
      ['Dove Soap Bar', 1500, 1100, 50, 20],
      ['Always Ultra Pads (Pack of 8)', 1600, 1200, 60, 20],
      ['Nivea Body Lotion 400ml', 5800, 4600, 24, 8],
      ['Vaseline Petroleum Jelly 250ml', 2900, 2100, 30, 10],
      ['Rexona Roll-On 50ml', 2800, 2100, 36, 12],
      ['Sunsilk Shampoo 350ml', 3400, 2650, 24, 8],
      ['Gillette Blue 3 Razors (Pack of 3)', 3800, 2900, 20, 8],
      ['Close-Up Toothpaste 100g', 1700, 1250, 40, 15],
    ],
  },
  {
    name: 'Baby',
    code: 'BBY',
    vatCategory: 'STANDARD',
    weight: 3,
    items: [
      ['Pampers Baby-Dry Size 3 (Pack of 36)', 12800, 10500, 24, 8],
      ['Cerelac Wheat 400g', 5000, 4100, 30, 10],
      ['Baby Wipes (Pack of 80)', 2600, 1900, 40, 14],
      ["Johnson's Baby Lotion 200ml", 3900, 3100, 24, 8],
      ['Nan Optipro 1 (400g)', 15000, 12500, 5, 8],
    ],
  },
  {
    name: 'Wines, Beer & Spirits',
    code: 'ALC',
    vatCategory: 'STANDARD',
    weight: 4,
    items: [
      ['Star Lager 60cl', 1000, 760, 120, 40],
      ['Heineken 33cl', 1100, 850, 96, 36],
      ['Guinness Foreign Extra 50cl', 1100, 850, 72, 24],
      ['Four Cousins Sweet Red Wine 750ml', 7200, 5800, 30, 10],
      ['Smirnoff Vodka 75cl', 14500, 11800, 5, 5],
    ],
  },
];

// Fixed-digit EAN-13 with a valid check digit, in the in-store range (leading "2").
function ean13(seed: number): string {
  const body = `2${String(seed).padStart(11, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export const PRODUCTS: SupermarketProduct[] = DEPARTMENTS.flatMap((dept, d) =>
  dept.items.map(([name, price, cost, onHand, reorderLevel, vat], i) => ({
    name,
    // 5xxxxx seeds keep these distinct from the pharmacy demo's codes too, for easy recognition.
    barcode: ean13(500_000 + 1000 * (d + 1) + i + 1),
    sku: `BFS-${dept.code}-${String(i + 1).padStart(3, '0')}`,
    department: dept.name,
    vatCategory: vat ?? dept.vatCategory,
    price,
    cost,
    onHand,
    reorderLevel,
  })),
);

// Items deliberately left at or under their reorder level after a reset — the "what do I need to
// reorder?" talking point. The live job restocks them only once they get critically low.
export const LOW_STOCK_NAMES = new Set(PRODUCTS.filter((p) => p.onHand <= p.reorderLevel).map((p) => p.name));

// One planned price rise, so an item's order history shows two prices (sugar is the classic one).
export const SUPERMARKET_PRICE_CHANGE = {
  itemName: 'Dangote Sugar 1kg',
  oldPrice: 2400,
  daysAgo: 35,
};

// Spoiled or short-dated stock written off during the stock window: [item, quantity, days ago].
export const SPOILAGE_WRITE_OFFS: [string, number, number][] = [
  ['Tomatoes (Small Basket)', 6, 3],
  ['Bananas (Hand)', 5, 4],
  ['Sliced Bread (Large Loaf)', 8, 2],
  ['Hollandia Yoghurt Natural 500ml', 4, 6],
  ['Plantain (Bunch of 4)', 4, 8],
  ['Cabbage (Medium)', 3, 11],
  ['Frozen Chicken (Whole, ~1.2kg)', 2, 14],
  ['Hollandia Yoghurt Strawberry 1L', 3, 17],
];

export const SUPERMARKET_PAYMENT_MIX: { kind: 'AUTO_TRANSFER' | 'AUTO_POS' | 'MANUAL_TRANSFER' | 'MANUAL_CARD' | 'CASH' | 'BANK_TRANSFER'; weight: number }[] = [
  { kind: 'AUTO_POS', weight: 28 },
  { kind: 'CASH', weight: 26 },
  { kind: 'AUTO_TRANSFER', weight: 22 },
  { kind: 'MANUAL_CARD', weight: 9 },
  { kind: 'MANUAL_TRANSFER', weight: 8 },
  { kind: 'BANK_TRANSFER', weight: 7 },
];

// Five cashiers stand in for five lanes: a held cart is parked at one and picked up at another.
export const SUPERMARKET_STAFF: { firstName: string; lastName: string; roles: ('CASHIER' | 'MANAGER' | 'SUPERVISOR' | 'STOREKEEPER')[] }[] = [
  { firstName: 'Chiamaka', lastName: 'Eze', roles: ['MANAGER'] },
  { firstName: 'Ibrahim', lastName: 'Danladi', roles: ['SUPERVISOR'] },
  { firstName: 'Blessing', lastName: 'Okoro', roles: ['CASHIER'] },
  { firstName: 'Musa', lastName: 'Garba', roles: ['CASHIER'] },
  { firstName: 'Ngozi', lastName: 'Obi', roles: ['CASHIER'] },
  { firstName: 'Tunde', lastName: 'Bakare', roles: ['CASHIER'] },
  { firstName: 'Aisha', lastName: 'Lawal', roles: ['CASHIER'] },
  { firstName: 'Emeka', lastName: 'Nwosu', roles: ['STOREKEEPER'] },
];

// Most shoppers are walk-ins with no record. The rest are loyalty/repeat customers; the first few
// are given on-account wallets (staff accounts, estates, small caterers).
export const SUPERMARKET_CUSTOMER_COUNT = 320;
export const SUPERMARKET_REGULAR_COUNT = 30;
export const SUPERMARKET_EXTRA_WALLET_CUSTOMERS = 10;
export const SUPERMARKET_CUSTOMER_RATE = 0.3;

// A couple of carts are kept parked at the tills so the Hold/Recall feature has something to show
// the moment a prospect opens checkout. Parked carts go stale: the live job sweeps ones older than
// this and parks fresh ones during opening hours.
export const SUPERMARKET_HELD_TARGET = 2;
export const SUPERMARKET_HELD_MAX_AGE_MIN = 40;
