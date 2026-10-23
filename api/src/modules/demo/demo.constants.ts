import { MenuCategoryKind, UnitOfMeasure } from '@prisma/client';

// Everything here is invented for sales demos. The *shape* (order volume, hour curve, basket size,
// order-type and payment mix, charges) is modelled on a real high-volume Abuja/Lagos restaurant,
// but no real menu, customer, staff or payment data is copied.

export const DEMO_ORG_NAME = 'The Courtyard Maitama';
export const DEMO_ORG_SLUG = 'the-courtyard-maitama-demo';
export const DEMO_ADMIN_EMAIL = 'courtyard.demo@tarione.com';
export const DEMO_STAFF_EMAIL_DOMAIN = 'demo.tarione.com';

// Lagos/Abuja is UTC+1 all year (no DST), so a fixed offset is exact.
export const LAGOS_UTC_OFFSET_MINUTES = 60;

// Business day runs 08:00 → 02:00 the next morning (Organization.shiftStartTime/shiftEndTime).
export const OPEN_MINUTE = 8 * 60;
export const CLOSE_MINUTE = 26 * 60;
export const SHIFT_START_TIME = '08:00';
export const SHIFT_END_TIME = '02:00';

export const HISTORY_DAYS = 90;
export const RETENTION_DAYS = 120;
export const BASE_ORDERS_PER_DAY = 125;

// Relative share of orders placed in each hour from 08:00 (index 0) to 01:00 (index 17).
export const HOURLY_WEIGHTS = [3.1, 4.5, 5.8, 6.0, 6.5, 7.3, 6.6, 7.5, 8.6, 8.6, 7.7, 6.4, 5.3, 3.8, 2.0, 1.3, 0.8, 0.6];

// Index = ISO weekday - 1 (Mon..Sun).
export const WEEKDAY_FACTORS = [0.8, 0.95, 1.1, 1.08, 1.05, 1.08, 0.92];

export const ORG_SETTINGS = {
  taxRate: 7.5,
  vatEnabled: true,
  entertainmentTaxRate: 5,
  entertainmentTaxEnabled: true,
  serviceChargeRate: 5,
  serviceChargeEnabled: true,
};

export interface DemoOrderType {
  name: string;
  requiresTable: boolean;
  weight: number;
}

export const ORDER_TYPES: DemoOrderType[] = [
  { name: 'Dine In', requiresTable: true, weight: 74 },
  { name: 'Takeaway', requiresTable: false, weight: 14 },
  { name: 'Delivery', requiresTable: false, weight: 11 },
  { name: 'Private Dining', requiresTable: true, weight: 1 },
];

// Configurable payment types. CASH/BANK_TRANSFER keep the default names because shift close
// reconciles the till against the literal 'CASH' method. WALLET is reserved and needs no PaymentType row; the two
// MONIEPOINT_* methods are what the Moniepoint webhook writes for auto-matched payments.
export const PAYMENT_TYPES = ['CASH', 'Transfer (Moniepoint)', 'Card (Moniepoint)', 'BANK_TRANSFER'];

export type PaymentKind =
  | 'AUTO_TRANSFER'
  | 'AUTO_POS'
  | 'MANUAL_TRANSFER'
  | 'MANUAL_CARD'
  | 'WALLET'
  | 'CASH'
  | 'BANK_TRANSFER';

export const PAYMENT_MIX: { kind: PaymentKind; weight: number }[] = [
  { kind: 'AUTO_TRANSFER', weight: 32 },
  { kind: 'AUTO_POS', weight: 14 },
  { kind: 'MANUAL_TRANSFER', weight: 16 },
  { kind: 'MANUAL_CARD', weight: 8 },
  { kind: 'CASH', weight: 10 },
  { kind: 'BANK_TRANSFER', weight: 8 },
];

// The payment_method string stored on Payment rows for each kind.
export const PAYMENT_METHOD_FOR: Record<PaymentKind, string> = {
  AUTO_TRANSFER: 'MONIEPOINT_TRANSFER',
  AUTO_POS: 'MONIEPOINT_POS',
  MANUAL_TRANSFER: 'Transfer (Moniepoint)',
  MANUAL_CARD: 'Card (Moniepoint)',
  WALLET: 'WALLET',
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
};

// What closeWithPayment is called with for each kind. Auto kinds are closed as their manual
// equivalent and then relabelled, mirroring what the Moniepoint webhook would have recorded.
export const CLOSE_METHOD_FOR: Record<PaymentKind, string> = {
  ...PAYMENT_METHOD_FOR,
  AUTO_TRANSFER: 'Transfer (Moniepoint)',
  AUTO_POS: 'Card (Moniepoint)',
};

export interface DemoMenuItem {
  name: string;
  price: number;
}

export interface DemoMenuCategory {
  name: string;
  kind: MenuCategoryKind;
  // How often a line from this category's kind lands in this category.
  weight: number;
  // Most popular first — basket picks are skewed towards the top of each list.
  items: DemoMenuItem[];
}

export const MENU: DemoMenuCategory[] = [
  {
    name: 'Grills',
    kind: 'FOOD',
    weight: 16,
    items: [
      { name: 'Grilled Chicken (Half)', price: 16500 },
      { name: 'Peppered Goat Meat', price: 9500 },
      { name: 'Suya Platter', price: 14000 },
      { name: 'Chicken Wings (8 pcs)', price: 12000 },
      { name: 'Asun', price: 9000 },
      { name: 'Grilled Croaker Fish', price: 28000 },
      { name: 'Beef Suya Skewers', price: 11500 },
      { name: 'Barbecue Pork Ribs', price: 26500 },
      { name: 'Grilled Turkey', price: 13500 },
      { name: 'Mixed Grill Platter', price: 45000 },
    ],
  },
  {
    name: 'Rice & Pasta',
    kind: 'FOOD',
    weight: 18,
    items: [
      { name: 'Jollof Rice with Grilled Chicken', price: 14000 },
      { name: 'Fried Rice with Beef', price: 13500 },
      { name: 'Ofada Rice with Ayamase', price: 15500 },
      { name: 'Seafood Linguine', price: 23500 },
      { name: 'Coconut Rice with Prawns', price: 18500 },
      { name: 'Native Jollof with Smoked Fish', price: 16000 },
      { name: 'Chicken Alfredo', price: 18000 },
      { name: 'Spaghetti Bolognese', price: 15000 },
      { name: 'Basmati Rice with Chicken Curry', price: 17000 },
    ],
  },
  {
    name: 'Soups & Swallow',
    kind: 'FOOD',
    weight: 13,
    items: [
      { name: 'Egusi Soup with Pounded Yam', price: 15500 },
      { name: 'Goat Meat Pepper Soup', price: 12500 },
      { name: 'Catfish Pepper Soup', price: 15000 },
      { name: 'Afang Soup with Semo', price: 16500 },
      { name: 'Edikang Ikong with Eba', price: 17000 },
      { name: 'Ogbono Soup with Amala', price: 14500 },
      { name: 'Oha Soup with Fufu', price: 16000 },
      { name: 'Banga Soup with Starch', price: 18000 },
    ],
  },
  {
    name: 'Small Plates',
    kind: 'FOOD',
    weight: 14,
    items: [
      { name: 'Peppered Snail', price: 14500 },
      { name: 'Gizdodo', price: 9500 },
      { name: 'Spring Rolls', price: 7500 },
      { name: 'Samosas', price: 7000 },
      { name: 'Loaded Fries', price: 8000 },
      { name: 'Nachos with Minced Beef', price: 12500 },
      { name: 'Fried Yam with Egg Sauce', price: 8500 },
      { name: 'Plantain Mosa', price: 5500 },
      { name: 'Puff Puff', price: 4000 },
      { name: 'Moi Moi', price: 3500 },
    ],
  },
  {
    name: 'Burgers & Wraps',
    kind: 'FOOD',
    weight: 10,
    items: [
      { name: 'Courtyard Beef Burger', price: 15500 },
      { name: 'Chicken Shawarma', price: 8500 },
      { name: 'Crispy Chicken Burger', price: 14000 },
      { name: 'Beef Shawarma', price: 9000 },
      { name: 'Club Sandwich', price: 13000 },
      { name: 'Chicken Caesar Wrap', price: 11500 },
    ],
  },
  {
    name: 'Salads',
    kind: 'FOOD',
    weight: 5,
    items: [
      { name: 'Chicken Caesar Salad', price: 13500 },
      { name: 'Avocado and Prawn Salad', price: 16500 },
      { name: 'Greek Salad', price: 11000 },
      { name: 'Nigerian Salad', price: 9000 },
    ],
  },
  {
    name: 'Breakfast',
    kind: 'FOOD',
    weight: 5,
    items: [
      { name: 'Full English Breakfast', price: 16000 },
      { name: 'Yam and Egg Breakfast', price: 11500 },
      { name: 'Pancake Stack', price: 10500 },
      { name: 'Omelette and Toast', price: 8500 },
      { name: 'Akara and Pap', price: 7500 },
    ],
  },
  {
    name: 'Sides',
    kind: 'FOOD',
    weight: 13,
    items: [
      { name: 'Fried Plantain (Dodo)', price: 3000 },
      { name: 'Chips', price: 3500 },
      { name: 'Sweet Potato Fries', price: 4000 },
      { name: 'White Rice', price: 3000 },
      { name: 'Coleslaw', price: 2500 },
      { name: 'Steamed Vegetables', price: 3500 },
      { name: 'Extra Pounded Yam', price: 2500 },
      { name: 'Extra Eba', price: 1500 },
    ],
  },
  {
    name: 'Desserts',
    kind: 'FOOD',
    weight: 6,
    items: [
      { name: 'Chocolate Lava Cake', price: 9500 },
      { name: 'Ice Cream (2 Scoops)', price: 5500 },
      { name: 'Cheesecake', price: 8500 },
      { name: 'Fruit Platter', price: 8000 },
    ],
  },
  {
    name: 'Cocktails',
    kind: 'DRINK',
    weight: 16,
    items: [
      { name: 'Chapman', price: 6500 },
      { name: 'Zobo Mojito', price: 9000 },
      { name: 'Long Island Iced Tea', price: 12500 },
      { name: 'Mojito', price: 10000 },
      { name: 'Courtyard Sunset', price: 11500 },
      { name: 'Pina Colada', price: 10500 },
      { name: 'Margarita', price: 11000 },
      { name: 'Espresso Martini', price: 12000 },
      { name: 'Aperol Spritz', price: 12500 },
      { name: 'Whisky Sour', price: 12000 },
    ],
  },
  {
    name: 'Mocktails',
    kind: 'DRINK',
    weight: 12,
    items: [
      { name: 'Virgin Mojito', price: 7500 },
      { name: 'Tropical Punch', price: 7000 },
      { name: 'Passion Fruit Cooler', price: 7500 },
      { name: 'Virgin Pina Colada', price: 7500 },
      { name: 'Watermelon Mint Cooler', price: 7000 },
    ],
  },
  {
    name: 'Juices & Smoothies',
    kind: 'DRINK',
    weight: 10,
    items: [
      { name: 'Fresh Orange Juice', price: 5500 },
      { name: 'Pineapple Ginger Juice', price: 5500 },
      { name: 'Watermelon Juice', price: 5000 },
      { name: 'Mango Smoothie', price: 7500 },
      { name: 'Berry Smoothie', price: 8500 },
      { name: 'Green Detox Smoothie', price: 8500 },
    ],
  },
  {
    name: 'Wine & Spirits',
    kind: 'DRINK',
    weight: 12,
    items: [
      { name: 'House Red Wine (Glass)', price: 9000 },
      { name: 'Jameson (Shot)', price: 6000 },
      { name: 'House White Wine (Glass)', price: 9000 },
      { name: "Jack Daniel's (Shot)", price: 6500 },
      { name: 'Tequila (Shot)', price: 7000 },
      { name: 'Glenfiddich 12 (Shot)', price: 9000 },
      { name: 'Baileys (Glass)', price: 7500 },
      { name: 'House Red Wine (Bottle)', price: 42000 },
      { name: 'Hennessy VS (Bottle)', price: 95000 },
      { name: 'Champagne Brut (Bottle)', price: 135000 },
    ],
  },
  {
    name: 'Beer & Soft Drinks',
    kind: 'DRINK',
    weight: 38,
    items: [
      { name: 'Bottled Water', price: 1500 },
      { name: 'Coca-Cola', price: 2000 },
      { name: 'Heineken', price: 3500 },
      { name: 'Guinness Stout', price: 3500 },
      { name: 'Star Lager', price: 3000 },
      { name: 'Sprite', price: 2000 },
      { name: 'Fanta', price: 2000 },
      { name: 'Malt Drink', price: 2500 },
      { name: 'Sparkling Water', price: 3500 },
      { name: 'Desperados', price: 4500 },
      { name: 'Red Bull', price: 4500 },
    ],
  },
  {
    name: 'Hot Drinks',
    kind: 'DRINK',
    weight: 8,
    items: [
      { name: 'Cappuccino', price: 5500 },
      { name: 'Americano', price: 4500 },
      { name: 'Latte', price: 5500 },
      { name: 'Espresso', price: 4000 },
      { name: 'Hot Chocolate', price: 5500 },
      { name: 'English Breakfast Tea', price: 3500 },
      { name: 'Green Tea', price: 3500 },
    ],
  },
  {
    name: 'Packaging',
    kind: 'OTHER',
    weight: 0,
    items: [{ name: 'Takeaway Pack', price: 700 }],
  },
];

export const TAKEAWAY_PACK_NAME = 'Takeaway Pack';

// One planned price rise, so a menu item's order history shows two prices.
export const PRICE_CHANGE = {
  itemName: 'Jollof Rice with Grilled Chicken',
  oldPrice: 12500,
  daysAgo: 42,
};

export interface DemoInventoryItem {
  name: string;
  unitOfMeasure: UnitOfMeasure;
  unitPrice: number;
  onHand: number;
  reorderLevel: number;
}

export const INVENTORY: DemoInventoryItem[] = [
  { name: 'Chicken (Whole)', unitOfMeasure: 'UNIT', unitPrice: 9500, onHand: 64, reorderLevel: 30 },
  { name: 'Parboiled Rice', unitOfMeasure: 'KG', unitPrice: 1800, onHand: 140, reorderLevel: 50 },
  { name: 'Goat Meat', unitOfMeasure: 'KG', unitPrice: 9000, onHand: 18, reorderLevel: 20 },
  { name: 'Beef', unitOfMeasure: 'KG', unitPrice: 7500, onHand: 42, reorderLevel: 20 },
  { name: 'Croaker Fish', unitOfMeasure: 'UNIT', unitPrice: 12000, onHand: 22, reorderLevel: 10 },
  { name: 'Catfish', unitOfMeasure: 'UNIT', unitPrice: 6500, onHand: 9, reorderLevel: 12 },
  { name: 'Plantain', unitOfMeasure: 'UNIT', unitPrice: 600, onHand: 210, reorderLevel: 80 },
  { name: 'Yam Flour (Pounded Yam)', unitOfMeasure: 'KG', unitPrice: 2800, onHand: 35, reorderLevel: 15 },
  { name: 'Prawns', unitOfMeasure: 'KG', unitPrice: 16000, onHand: 6, reorderLevel: 5 },
  { name: 'Linguine Pasta', unitOfMeasure: 'KG', unitPrice: 3500, onHand: 25, reorderLevel: 10 },
  { name: 'Snails', unitOfMeasure: 'UNIT', unitPrice: 1500, onHand: 120, reorderLevel: 60 },
  { name: 'Burger Buns', unitOfMeasure: 'UNIT', unitPrice: 400, onHand: 96, reorderLevel: 40 },
];

// Recipe lines: menu item → [inventory item, quantity per order].
export const RECIPES: Record<string, [string, number][]> = {
  'Grilled Chicken (Half)': [['Chicken (Whole)', 0.5]],
  'Jollof Rice with Grilled Chicken': [['Parboiled Rice', 0.25], ['Chicken (Whole)', 0.25]],
  'Fried Rice with Beef': [['Parboiled Rice', 0.25], ['Beef', 0.15]],
  'Coconut Rice with Prawns': [['Parboiled Rice', 0.25], ['Prawns', 0.12]],
  'Native Jollof with Smoked Fish': [['Parboiled Rice', 0.25]],
  'Basmati Rice with Chicken Curry': [['Chicken (Whole)', 0.25]],
  'Peppered Goat Meat': [['Goat Meat', 0.3]],
  'Asun': [['Goat Meat', 0.3]],
  'Goat Meat Pepper Soup': [['Goat Meat', 0.3]],
  'Catfish Pepper Soup': [['Catfish', 1]],
  'Grilled Croaker Fish': [['Croaker Fish', 1]],
  'Suya Platter': [['Beef', 0.3]],
  'Beef Suya Skewers': [['Beef', 0.2]],
  'Chicken Wings (8 pcs)': [['Chicken (Whole)', 0.4]],
  'Seafood Linguine': [['Linguine Pasta', 0.15], ['Prawns', 0.1]],
  'Egusi Soup with Pounded Yam': [['Yam Flour (Pounded Yam)', 0.2], ['Beef', 0.1]],
  'Peppered Snail': [['Snails', 4]],
  'Gizdodo': [['Plantain', 1]],
  'Fried Plantain (Dodo)': [['Plantain', 1]],
  'Courtyard Beef Burger': [['Burger Buns', 1], ['Beef', 0.2]],
  'Crispy Chicken Burger': [['Burger Buns', 1], ['Chicken (Whole)', 0.2]],
};

export interface DemoTable {
  name: string;
  section: string;
  capacity: number;
  orderType: string;
}

function tables(prefix: string, count: number, section: string, capacity: number, orderType = 'Dine In'): DemoTable[] {
  return Array.from({ length: count }, (_, i) => ({ name: `${prefix}${i + 1}`, section, capacity, orderType }));
}

export const TABLES: DemoTable[] = [
  ...tables('M', 14, 'Main Hall', 4),
  ...tables('T', 10, 'Terrace', 4),
  ...tables('L', 6, 'Lounge', 6),
  ...tables('PD', 2, 'Private Dining Room', 12, 'Private Dining'),
];

export const STAFF: { firstName: string; lastName: string; roles: ('WAITER' | 'CASHIER' | 'MANAGER' | 'KITCHEN')[] }[] = [
  { firstName: 'Aisha', lastName: 'Bello', roles: ['MANAGER'] },
  { firstName: 'Chinedu', lastName: 'Okafor', roles: ['CASHIER'] },
  { firstName: 'Halima', lastName: 'Sani', roles: ['CASHIER'] },
  { firstName: 'Tunde', lastName: 'Adeyemi', roles: ['WAITER'] },
  { firstName: 'Ngozi', lastName: 'Eze', roles: ['WAITER'] },
  { firstName: 'Ibrahim', lastName: 'Musa', roles: ['WAITER'] },
  { firstName: 'Blessing', lastName: 'Okon', roles: ['WAITER'] },
  { firstName: 'Emeka', lastName: 'Nwosu', roles: ['WAITER'] },
  { firstName: 'Zainab', lastName: 'Lawal', roles: ['WAITER'] },
  { firstName: 'Samuel', lastName: 'Etim', roles: ['KITCHEN'] },
  { firstName: 'Fatima', lastName: 'Garba', roles: ['KITCHEN'] },
];

export const CUSTOMER_COUNT = 900;
// The first REGULAR_COUNT customers come back several times a week.
export const REGULAR_COUNT = 40;
// Regulars plus this many others get wallets with an approved credit limit.
export const EXTRA_WALLET_CUSTOMERS = 25;

export const FIRST_NAMES = [
  'Adaeze', 'Abdullahi', 'Amaka', 'Babatunde', 'Chiamaka', 'Damilola', 'Ebuka', 'Folake', 'Gbenga', 'Hadiza',
  'Ifeanyi', 'Jumoke', 'Kelechi', 'Lola', 'Maryam', 'Nnamdi', 'Obinna', 'Oluwaseun', 'Precious', 'Rukayat',
  'Segun', 'Temitope', 'Uche', 'Victor', 'Yetunde', 'Zara', 'Ahmed', 'Bukola', 'Chidi', 'Dayo',
  'Efe', 'Funmi', 'Habib', 'Ijeoma', 'Kunle', 'Ladi', 'Musa', 'Nkechi', 'Osas', 'Rasheed',
  'Sade', 'Tobi', 'Usman', 'Wale', 'Yusuf', 'Amina', 'David', 'Grace', 'Joseph', 'Sarah',
];

export const LAST_NAMES = [
  'Abubakar', 'Adebayo', 'Afolabi', 'Agu', 'Akande', 'Aliyu', 'Bakare', 'Danladi','Ekwueme', 'Eze',
  'Fashola', 'Ibe', 'Idris', 'Igwe', 'Jibrin', 'Kalu', 'Mohammed', 'Nwachukwu', 'Obi', 'Odu',
  'Ogunleye', 'Ojo', 'Okeke', 'Okoro', 'Olawale', 'Onyeka', 'Salami', 'Shehu', 'Umar', 'Yakubu',
];

export const SENDER_BANKS = ['GTBank', 'Access Bank', 'Zenith Bank', 'First Bank', 'UBA', 'Kuda', 'OPay', 'Moniepoint MFB'];
