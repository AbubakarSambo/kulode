import { VatCategory } from '@prisma/client';

// Everything here is invented for sales demos of the RETAIL POS mode. The pharmacy, its staff and
// its customers are fictional; product names are ordinary Nigerian-market drugs and consumer
// brands (as the restaurant demo uses real drink brands), priced to look right, not to be quoted.
// Barcodes are in the EAN-13 "in-store use" range (prefix 2), so they can never collide with a
// real product's code.

export const PHARMACY_ORG_NAME = 'Meridian Pharmacy Wuse II';
export const PHARMACY_ORG_SLUG = 'meridian-pharmacy-wuse-demo';
export const PHARMACY_ADMIN_EMAIL = 'meridian.demo@tarione.com';
// Different domain from the restaurant demo's staff so the two orgs' logins can never collide.
export const PHARMACY_STAFF_EMAIL_DOMAIN = 'pharmacy.demo.tarione.com';

// Business day runs 08:00 → 22:00 the same calendar day (Lagos is UTC+1 all year).
export const PHARMACY_OPEN_MINUTE = 8 * 60;
export const PHARMACY_CLOSE_MINUTE = 22 * 60;
export const PHARMACY_SHIFT_START_TIME = '08:00';
export const PHARMACY_SHIFT_END_TIME = '22:00';

export const PHARMACY_HISTORY_DAYS = 90;
export const PHARMACY_RETENTION_DAYS = 120;
// Stock movements are only written for this many recent days — enough to fill every item's
// movement history without ~25k extra rows per reset.
export const PHARMACY_STOCK_WINDOW_DAYS = 30;
export const PHARMACY_BASE_ORDERS_PER_DAY = 115;

// Relative share of sales in each hour from 08:00 (index 0) to 21:00 (index 13): a mid-morning
// bump, then the after-work rush from 17:00.
export const PHARMACY_HOURLY_WEIGHTS = [3.5, 5.5, 7, 7.5, 7, 6, 5, 5.5, 6.5, 8, 8.5, 6.5, 4, 2.5];

// Index = ISO weekday - 1 (Mon..Sun). Sunday is the quiet day.
export const PHARMACY_WEEKDAY_FACTORS = [1.05, 1, 1, 1, 1.08, 1.1, 0.75];

// Drugs are largely VAT-exempt in Nigeria, and the order maths only knows an org-wide VAT switch,
// so the demo pharmacy runs with VAT off rather than charging 7.5% on medicines.
export const PHARMACY_ORG_SETTINGS = {
  taxRate: 7.5,
  vatEnabled: false,
  entertainmentTaxRate: 0,
  entertainmentTaxEnabled: false,
  serviceChargeRate: 0,
  serviceChargeEnabled: false,
};

// The one order type a retail org has (see OrderTypesService.seedDefaults).
export const PHARMACY_ORDER_TYPE = 'Retail Sale';

export interface PharmacyProduct {
  name: string;
  barcode: string;
  sku: string;
  department: string;
  vatCategory: VatCategory;
  /** Shelf price (InventoryItem.sellPrice). */
  price: number;
  /** What the pharmacy pays its supplier (InventoryItem.unitPrice). */
  cost: number;
  /** On-hand after the seeded history, i.e. what the inventory screen shows right after a reset. */
  onHand: number;
  reorderLevel: number;
}

export interface PharmacyDepartment {
  name: string;
  code: string;
  vatCategory: VatCategory;
  /** How often a basket line lands in this department. */
  weight: number;
  /** [name, sell price, cost, on hand, reorder level, optional per-item VAT override] — most popular first. */
  items: [string, number, number, number, number, VatCategory?][];
}

export const DEPARTMENTS: PharmacyDepartment[] = [
  {
    name: 'Pain & Fever',
    code: 'PAIN',
    vatCategory: 'EXEMPT',
    weight: 17,
    items: [
      ['Paracetamol 500mg (Strip of 10)', 300, 210, 480, 150],
      ['Panadol Extra (Strip of 12)', 1100, 850, 260, 100],
      ['Ibuprofen 400mg (Strip of 10)', 600, 430, 180, 60],
      ['Diclofenac 50mg (Strip of 10)', 500, 350, 150, 50],
      ['Aspirin 75mg (Strip of 14)', 700, 500, 70, 25],
      ['Efferalgan Effervescent (Box of 16)', 3800, 3000, 40, 15],
      ['Voltaren Emulgel 20g', 5500, 4300, 28, 10],
      ['Deep Heat Rub 35g', 2800, 2100, 24, 8],
    ],
  },
  {
    name: 'Antimalarials',
    code: 'MAL',
    vatCategory: 'EXEMPT',
    weight: 12,
    items: [
      ['Coartem 80/480 (Pack of 6)', 3800, 3000, 90, 30],
      ['Lonart DS (Pack of 6)', 2800, 2200, 70, 25],
      ['Amatem Softgel (Pack of 6)', 3200, 2500, 40, 15],
      ['P-Alaxin (Pack of 3)', 3500, 2800, 45, 20],
    ],
  },
  {
    name: 'Antibiotics & Anti-infectives',
    code: 'ABX',
    vatCategory: 'EXEMPT',
    weight: 12,
    items: [
      ['Amoxicillin 500mg (Strip of 10)', 1500, 1100, 140, 50],
      ['Metronidazole 400mg (Strip of 10)', 600, 420, 160, 60],
      ['Ciprofloxacin 500mg (Strip of 10)', 1800, 1300, 80, 30],
      ['Augmentin 625mg (Pack of 14)', 9500, 7800, 12, 15],
      ['Ampiclox Capsules (Strip of 10)', 1800, 1300, 70, 25],
      ['Azithromycin 500mg (Pack of 3)', 3500, 2700, 50, 20],
      ['Doxycycline 100mg (Strip of 10)', 900, 650, 60, 20],
      ['Fluconazole 150mg (1 Capsule)', 1500, 1000, 45, 15],
      ['Clotrimazole Cream 20g', 1500, 1000, 40, 15],
      ['Cefuroxime 500mg (Strip of 10)', 7500, 6000, 25, 10],
    ],
  },
  {
    name: 'Cough, Cold & Allergy',
    code: 'COLD',
    vatCategory: 'EXEMPT',
    weight: 11,
    items: [
      ['Chlorpheniramine 4mg (Strip of 10)', 300, 200, 150, 50],
      ['Cetirizine 10mg (Strip of 10)', 700, 500, 120, 40],
      ['Loratadine 10mg (Strip of 10)', 900, 650, 110, 40],
      ['Flucold Tablets (Strip of 10)', 500, 350, 140, 50],
      ['Vicks Inhaler', 1200, 900, 80, 30],
      ['Strepsils Lozenges (Pack of 24)', 3400, 2700, 45, 15],
      ['Emzolyn Syrup 100ml', 2400, 1800, 40, 15],
      ['Benylin Cough Syrup 100ml', 3200, 2500, 36, 12],
      ['Otrivin Nasal Spray', 3600, 2800, 30, 10],
    ],
  },
  {
    name: 'Digestive Health',
    code: 'GIT',
    vatCategory: 'EXEMPT',
    weight: 9,
    items: [
      ['ORS Sachet', 300, 200, 200, 80],
      ['Omeprazole 20mg (Strip of 14)', 1500, 1000, 90, 30],
      ['Zinc 20mg Dispersible (Strip of 10)', 1000, 700, 80, 30],
      ['Buscopan 10mg (Strip of 10)', 1800, 1300, 50, 20],
      ['Imodium Caps (Pack of 6)', 1800, 1300, 40, 15],
      ['Maalox Suspension 170ml', 3800, 3000, 24, 8],
      ['Dulcolax 5mg (Pack of 10)', 2500, 1900, 30, 10],
      ['Gaviscon Liquid 150ml', 5500, 4500, 6, 8],
    ],
  },
  {
    name: 'Vitamins & Supplements',
    code: 'VIT',
    vatCategory: 'STANDARD',
    weight: 12,
    items: [
      ['Vitamin C 1000mg Effervescent (Tube of 10)', 3200, 2500, 60, 20],
      ['Vitamin B Complex (Strip of 10)', 600, 400, 120, 40],
      ['Folic Acid 5mg (Strip of 10)', 400, 280, 100, 30, 'EXEMPT'],
      ['Iron + Folic Acid Capsules (Strip of 10)', 900, 650, 60, 20, 'EXEMPT'],
      ['Multivitamin Kids Syrup 200ml', 4500, 3500, 24, 8],
      ['Seven Seas Cod Liver Oil (60 Capsules)', 8500, 6800, 22, 8],
      ['Centrum Adults (30 Tablets)', 12500, 10000, 18, 6],
      ['Omega-3 Fish Oil 1000mg (60 Capsules)', 9800, 7800, 16, 6],
      ['Vitamin D3 1000IU (60 Capsules)', 6500, 5000, 4, 6],
    ],
  },
  {
    name: 'Diabetes & Blood Pressure',
    code: 'CHR',
    vatCategory: 'EXEMPT',
    weight: 10,
    items: [
      ['Metformin 500mg (Strip of 10)', 600, 420, 200, 70],
      ['Amlodipine 5mg (Strip of 10)', 800, 550, 160, 50],
      ['Glibenclamide 5mg (Strip of 10)', 500, 350, 90, 30],
      ['Losartan 50mg (Strip of 10)', 1500, 1100, 100, 35],
      ['Hydrochlorothiazide 25mg (Strip of 10)', 700, 500, 60, 20],
      ['Atorvastatin 20mg (Strip of 10)', 2200, 1600, 70, 25],
      ['Glimepiride 2mg (Strip of 10)', 1800, 1300, 40, 15],
      ['Lisinopril 10mg (Strip of 10)', 1200, 850, 8, 20],
    ],
  },
  {
    name: 'Medical Devices & First Aid',
    code: 'DEV',
    vatCategory: 'STANDARD',
    weight: 9,
    items: [
      ['Malaria Rapid Test Kit', 1200, 800, 60, 20],
      ['Pregnancy Test Strip', 1000, 600, 80, 30],
      ['Hand Sanitizer 250ml', 2000, 1300, 50, 20],
      ['Plaster Strips (Box of 20)', 1200, 800, 50, 20],
      ['Dettol Antiseptic 250ml', 3800, 3000, 36, 12],
      ['Surgical Face Masks (Box of 50)', 2500, 1700, 40, 15],
      ['Digital Thermometer', 2500, 1700, 30, 10],
      ['Cotton Wool 100g', 1500, 1000, 40, 15],
      ['Crepe Bandage 3in', 1500, 1000, 30, 10],
      ['Surgical Gloves (Box of 100)', 6500, 5000, 20, 8],
      ['Pulse Oximeter', 9500, 7000, 10, 4],
      ['Accu-Chek Active Glucometer Kit', 18500, 15000, 8, 3],
      ['Accu-Chek Active Test Strips (50)', 14500, 12000, 3, 5],
      ['Omron BP Monitor (Upper Arm)', 38000, 31000, 2, 3],
    ],
  },
  {
    name: 'Mother & Baby',
    code: 'BABY',
    vatCategory: 'STANDARD',
    weight: 8,
    items: [
      ['Baby Wipes (Pack of 80)', 2500, 1800, 50, 20],
      ['Johnson\'s Baby Lotion 200ml', 3800, 3000, 30, 10],
      ['Johnson\'s Baby Powder 200g', 3200, 2500, 30, 10],
      ['Cerelac Wheat 400g', 4800, 4000, 36, 12],
      ['Woodward\'s Gripe Water 150ml', 2500, 1800, 32, 10],
      ['Feeding Bottle 250ml', 3500, 2500, 24, 8],
      ['Pampers Baby-Dry Size 3 (Pack of 36)', 12500, 10000, 24, 8],
      ['Prenatal Vitamins (30 Tablets)', 7500, 6000, 20, 8],
      ['Nan Optipro 1 (400g)', 14500, 12000, 5, 8],
    ],
  },
  {
    name: 'Personal Care & Skin',
    code: 'CARE',
    vatCategory: 'STANDARD',
    weight: 11,
    items: [
      ['Colgate Total Toothpaste 120g', 2200, 1600, 60, 20],
      ['Oral-B Toothbrush', 1200, 800, 60, 20],
      ['Dettol Original Soap (Pack of 3)', 2500, 1900, 50, 20],
      ['Always Ultra Pads (Pack of 8)', 1500, 1100, 70, 25],
      ['Vaseline Petroleum Jelly 250ml', 2800, 2000, 40, 15],
      ['Nivea Body Lotion 400ml', 5500, 4300, 24, 8],
      ['Hydrocortisone Cream 1% 15g', 2200, 1600, 30, 10, 'EXEMPT'],
      ['Sensodyne Toothpaste 100ml', 4500, 3500, 24, 8],
      ['Cetaphil Gentle Cleanser 250ml', 12500, 10000, 12, 5],
    ],
  },
  {
    name: 'Family Planning',
    code: 'FP',
    vatCategory: 'STANDARD',
    weight: 4,
    items: [
      ['Durex Extra Safe (Pack of 3)', 2000, 1400, 80, 30],
      ['Postinor-2 (1 Tablet)', 1800, 1200, 40, 15, 'EXEMPT'],
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

export const PRODUCTS: PharmacyProduct[] = DEPARTMENTS.flatMap((dept, d) =>
  dept.items.map(([name, price, cost, onHand, reorderLevel, vat], i) => ({
    name,
    barcode: ean13(1000 * (d + 1) + i + 1),
    sku: `MPH-${dept.code}-${String(i + 1).padStart(3, '0')}`,
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

// One planned price rise, so an item's order history shows two prices.
export const PHARMACY_PRICE_CHANGE = {
  itemName: 'Augmentin 625mg (Pack of 14)',
  oldPrice: 8500,
  daysAgo: 35,
};

// Short-dated stock written off during the stock window: [item, quantity, days ago].
export const EXPIRY_WRITE_OFFS: [string, number, number][] = [
  ['Benylin Cough Syrup 100ml', 3, 9],
  ['Emzolyn Syrup 100ml', 4, 16],
  ['Strepsils Lozenges (Pack of 24)', 2, 21],
  ['Vitamin C 1000mg Effervescent (Tube of 10)', 5, 12],
  ['Multivitamin Kids Syrup 200ml', 2, 5],
  ['Hydrocortisone Cream 1% 15g', 3, 24],
];

export const PHARMACY_PAYMENT_MIX: { kind: 'AUTO_TRANSFER' | 'AUTO_POS' | 'MANUAL_TRANSFER' | 'MANUAL_CARD' | 'CASH' | 'BANK_TRANSFER'; weight: number }[] = [
  { kind: 'CASH', weight: 36 },
  { kind: 'AUTO_TRANSFER', weight: 24 },
  { kind: 'AUTO_POS', weight: 20 },
  { kind: 'MANUAL_TRANSFER', weight: 8 },
  { kind: 'MANUAL_CARD', weight: 6 },
  { kind: 'BANK_TRANSFER', weight: 6 },
];

export const PHARMACY_STAFF: { firstName: string; lastName: string; roles: ('CASHIER' | 'MANAGER' | 'SUPERVISOR' | 'STOREKEEPER')[] }[] = [
  { firstName: 'Kemi', lastName: 'Adeleke', roles: ['MANAGER'] },
  { firstName: 'Danjuma', lastName: 'Pam', roles: ['SUPERVISOR'] },
  { firstName: 'Obiora', lastName: 'Nwankwo', roles: ['CASHIER'] },
  { firstName: 'Salamatu', lastName: 'Yusuf', roles: ['CASHIER'] },
  { firstName: 'Funke', lastName: 'Balogun', roles: ['CASHIER'] },
  { firstName: 'Hauwa', lastName: 'Ibrahim', roles: ['STOREKEEPER'] },
];

// Most customers are walk-ins with no record. The rest are repeat patients; the first few on
// chronic medication are given on-account wallets.
export const PHARMACY_CUSTOMER_COUNT = 260;
export const PHARMACY_REGULAR_COUNT = 24;
export const PHARMACY_EXTRA_WALLET_CUSTOMERS = 14;
export const PHARMACY_CUSTOMER_RATE = 0.2;
