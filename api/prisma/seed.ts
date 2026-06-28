import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seeding database...');

  // Clean the database
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "organizations" CASCADE;`);

  // Hash password
  const passwordHash = await bcrypt.hash('password123', 12);

  // ─── 1. ACME CORP (PRO PLAN) ────────────────────────────────────────────────
  console.log('Seeding Acme Corp...');
  
  const acme = await prisma.organization.create({
    data: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      email: 'finance@acme.com',
      phone: '+234 801 234 5678',
      address: '123 Acme Way, Lagos, Nigeria',
      invoicePrefix: 'ACM',
      currency: 'NGN',
      vatEnabled: true,
      taxRate: 7.5,
      showQrCode: true,
      planTier: 'PRO',
      subscriptionStatus: 'ACTIVE',
      trialStartDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paystackSubaccountCode: 'ACCT_acme123',
      isPaystackVerified: true,
      bankCode: '044',
      bankAccountNumber: '0123456789',
      bankAccountName: 'Acme Corp Settlement Account',
      settlementBank: 'Access Bank',
    },
  });

  // Acme Users
  const acmeSuperAdmin = await prisma.user.create({
    data: {
      organizationId: acme.id,
      email: 'admin@acme.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'SUPER_ADMIN',
      isEmailVerified: true,
      isPlatformAdmin: true,
    },
  });

  const acmeAccountant = await prisma.user.create({
    data: {
      organizationId: acme.id,
      email: 'accountant@acme.com',
      passwordHash,
      firstName: 'Alice',
      lastName: 'Smith',
      role: 'ACCOUNTANT',
      isEmailVerified: true,
    },
  });

  const acmeStaff = await prisma.user.create({
    data: {
      organizationId: acme.id,
      email: 'staff@acme.com',
      passwordHash,
      firstName: 'Bob',
      lastName: 'Johnson',
      role: 'STAFF',
      isEmailVerified: true,
    },
  });

  // Acme Clients
  const clientsData = [
    { name: 'Delta Ventures', email: 'billing@deltaventures.com', phone: '+234 802 345 6789', address: '45 Delta Crescent, Abuja', isActive: true },
    { name: 'Sigma Logistics', email: 'finance@sigma.ng', phone: '+234 803 456 7890', address: 'Plot 12 Sigma Industrial Estate, Port Harcourt', isActive: true },
  ];

  const realCompanyNames = [
    'Amina Bello & Partners',
    'Flutterwave Technologies',
    'Dangote Group',
    'Paystack Payments',
    'Oando Energy',
    'Mike Adenuga Associates',
    'Interswitch Group',
    'Zinox Computers',
    'MainOne Cable Co',
    'SeamlessHR Ltd',
    'PiggyVest Solutions',
    'Moniepoint Microfinance',
    'Brass Business Banking',
    'Duplo Payments',
    'Helium Health Corp',
    'Chowdeck Logistics',
    'Reliance HMO',
    'Leadway Assurance',
    'Sovereign Trust PLC',
    'Tony Elumelu Foundation',
    'Aliko Dangote Foundation',
    'Julius Berger Nigeria',
    'Vanguard Media Group',
    'Punch Newspapers',
    'Kuda Microfinance Bank',
    'FairMoney Lending',
    'Carbon Finance',
    'Renmoney Ltd',
    'Paga Agent Network',
    'Babban Gona Agriculture',
    'Farmcrowdy Ventures',
    'Lifebank Medical',
    '54gene Diagnostics',
    'Max.ng Logistics',
    'Gokada Delivery',
    'Risevest Investments',
    'Bamboo Stock Trading',
    'Chaka Investments',
    'Bundle Africa',
    'BuyCoins Crypto',
    'Cowrywise Savings',
    'Abeg Technologies',
    'AltSchool Africa',
    'TalentQL Group',
    'Decagon Software Training',
    'Semicolon Africa',
    'Utiva Education',
    'Relearn by CcHub'
  ];
  const cities = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Enugu', 'Kaduna', 'Benin City'];

  for (let i = 0; i < 48; i++) {
    const name = realCompanyNames[i] || `Enterprise Solutions ${i + 1}`;
    const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const email = `finance@${cleanSlug}.com`;
    const phone = `+234 80${Math.floor(Math.random() * 9)}${Math.floor(1000000 + Math.random() * 9000000)}`;
    const city = cities[Math.floor(Math.random() * cities.length)];
    const isActive = Math.random() > 0.15; // 85% active

    clientsData.push({
      name,
      email,
      phone,
      address: `${15 + i} Commercial Ave, ${city}`,
      isActive,
    });
  }

  const createdClients = [];
  for (const clientItem of clientsData) {
    const client = await prisma.client.create({
      data: {
        organizationId: acme.id,
        ...clientItem,
      },
    });
    createdClients.push(client);
  }

  // Acme Service Items (16 items)
  const servicesData = [
    { name: 'Software Development Consulting', description: 'Senior Software Architecture and engineering consulting per hour', unitPrice: 75000 },
    { name: 'Cloud Infrastructure Audit', description: 'Comprehensive review of AWS/GCP setups and cost optimization report', unitPrice: 350000 },
    { name: 'UI/UX Product Design Workshop', description: 'Interactive design sprints and user journey mapping', unitPrice: 250000 },
    { name: 'Cybersecurity Pentesting Audit', description: 'Security threat analysis, vulnerability scans, and reporting', unitPrice: 500000 },
    { name: 'Backend API Optimization', description: 'Performance tuning, query optimizations, and scaling consulting', unitPrice: 120000 },
    { name: 'Mobile App Development', description: 'iOS and Android native or hybrid development sprints', unitPrice: 150000 },
    { name: 'DevOps Pipeline Automation', description: 'CI/CD setups, Kubernetes orchestration, and deployment automation', unitPrice: 180000 },
    { name: 'PostgreSQL Database Tuning', description: 'Index analysis, query rewrites, and database maintenance tuning', unitPrice: 95000 },
    { name: 'AI/ML Model Integration', description: 'Integrating LLMs, data modeling, and machine learning pipelines', unitPrice: 300000 },
    { name: 'Technical Writing & Documentation', description: 'API reference guides, developer portals, and system manuals', unitPrice: 60000 },
    { name: 'Agile Project Management Consultancy', description: 'Scrum master outsourcing and agile transition consulting', unitPrice: 80000 },
    { name: 'Quality Assurance Automation', description: 'Writing E2E Playwright/Cypress tests and integration suites', unitPrice: 85000 },
    { name: 'Front-End React Development', description: 'Vite, Next.js, and TypeScript frontend development sprints', unitPrice: 90000 },
    { name: 'System Architecture Review', description: 'Reviewing blueprints, microservice design, and design documents', unitPrice: 200000 },
    { name: 'Data Analytics & Business Intelligence', description: 'Building dashboards, ETL pipelines, and warehouse setups', unitPrice: 160000 },
    { name: 'IT Support Desk Retainer', description: '24/7 helpdesk and infrastructure support retainer per month', unitPrice: 450000 },
  ];

  const createdServices = [];
  for (const item of servicesData) {
    const service = await prisma.serviceItem.create({
      data: {
        organizationId: acme.id,
        name: item.name,
        description: item.description,
        unitPrice: item.unitPrice,
      },
    });
    createdServices.push(service);
  }

  // Acme Inventory Items (16 items)
  const inventoryItemsData = [
    { name: 'Dell XPS 15 Laptop', description: 'Core i7, 32GB RAM, 1TB SSD developer workstation laptop', unitPrice: 1800000, onHandQuantity: 15, sku: 'DELL-XPS15-01' },
    { name: 'Logitech MX Master 3S Mouse', description: 'Ergonomic wireless mouse for developers', unitPrice: 95000, onHandQuantity: 40, sku: 'LOGI-MX3S-02' },
    { name: 'Apple MacBook Pro 16 M3', description: 'M3 Max, 64GB RAM, 2TB SSD high-end developer laptop', unitPrice: 3500000, onHandQuantity: 10, sku: 'APPL-MBP16-03' },
    { name: 'ASUS ProArt Display 27"', description: '4K HDR color-accurate monitor for designer setups', unitPrice: 450000, onHandQuantity: 8, sku: 'ASUS-PA27-04' },
    { name: 'Keychron Q1 Mechanical Keyboard', description: 'Fully assembled custom mechanical keyboard', unitPrice: 165000, onHandQuantity: 20, sku: 'KEYC-Q1-05' },
    { name: 'Sony WH-1000XM5 Headphones', description: 'Wireless noise-canceling headphones for deep focus work', unitPrice: 320000, onHandQuantity: 12, sku: 'SONY-XM5-06' },
    { name: 'Herman Miller Aeron Chair', description: 'Ergonomic office chair for software engineers', unitPrice: 1200000, onHandQuantity: 5, sku: 'HM-AERON-07' },
    { name: 'Ubiquiti UniFi Dream Machine', description: 'Enterprise-grade firewall and router console', unitPrice: 550000, onHandQuantity: 6, sku: 'UBIQ-UDM-08' },
    { name: 'Elgato Stream Deck MK.2', description: '15 programmable LCD keys for workflow automation', unitPrice: 130000, onHandQuantity: 18, sku: 'ELGA-SDECK-09' },
    { name: 'Seagate 4TB External SSD', description: 'High-speed external backup solid-state drive', unitPrice: 190000, onHandQuantity: 25, sku: 'SEAG-SSD4-10' },
    { name: 'Belkin 3-in-1 Wireless Charger', description: 'MagSafe charging station for iPhone, Watch, and AirPods', unitPrice: 95000, onHandQuantity: 15, sku: 'BELK-CHG-11' },
    { name: 'Shure MV7 USB Microphone', description: 'Podcasting and corporate calling dynamic microphone', unitPrice: 220000, onHandQuantity: 10, sku: 'SHUR-MV7-12' },
    { name: 'Anker PowerConf H700 Headset', description: 'Wireless business headset with active noise canceling', unitPrice: 110000, onHandQuantity: 22, sku: 'ANKR-H700-13' },
    { name: 'Apple Studio Display 27"', description: '5K Retina display with nano-texture glass', unitPrice: 1600000, onHandQuantity: 4, sku: 'APPL-STUDIO-14' },
    { name: 'Keychron K2 Wireless Keyboard', description: 'Compact Bluetooth mechanical keyboard', unitPrice: 85000, onHandQuantity: 30, sku: 'KEYC-K2-15' },
    { name: 'LG UltraFine 32" 4K Monitor', description: 'Ergonomic stand UHD IPS monitor', unitPrice: 650000, onHandQuantity: 7, sku: 'LG-32UN880-16' },
  ];

  const createdInventory = [];
  for (const item of inventoryItemsData) {
    const inv = await prisma.inventoryItem.create({
      data: {
        organizationId: acme.id,
        name: item.name,
        description: item.description,
        unitPrice: item.unitPrice,
        onHandQuantity: item.onHandQuantity,
        sku: item.sku,
      },
    });
    createdInventory.push(inv);
  }

  // Acme Default Expense Categories
  const rentCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Rent', description: 'Office lease expenses' }
  });
  const salaryCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Salary', description: 'Staff salaries and bonuses' }
  });
  const transportCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Transport', description: 'Business travel and logistics' }
  });
  const utilitiesCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Utilities', description: 'Electricity, water, diesel, and other public services' }
  });
  const softwareCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Software & IT', description: 'SaaS subscriptions, server hosting, and software tools' }
  });
  const marketingCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Marketing', description: 'Advertising, client events, and promotional campaigns' }
  });
  const officeCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Office Operations', description: 'Supplies, cleaning, stationeries, and maintenance' }
  });
  const professionalCat = await prisma.expenseCategory.create({
    data: { organizationId: acme.id, name: 'Professional Fees', description: 'Legal, accounting, and consulting retainers' }
  });

  // Acme Vendors
  const acmeVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Prime Spaces Ltd',
      serviceDescription: 'Office space leasing and management',
      contactPerson: 'Mrs. Funmi Benson',
      phone: '+234 809 111 2222',
      email: 'rent@primespaces.com',
    },
  });

  const mtnVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'MTN Nigeria PLC',
      serviceDescription: 'Corporate fiber internet and data solutions',
      contactPerson: 'Mr. Tunde Bakare',
      phone: '+234 803 100 0001',
      email: 'business@mtn.com',
    },
  });

  const ekoElectricity = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Eko Electricity Distribution PLC',
      serviceDescription: 'Commercial power distribution and billing',
      phone: '+234 1 270 0321',
      email: 'customercare@ekedp.com',
    },
  });

  const googleVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Google Cloud Nigeria',
      serviceDescription: 'GSuite Workspace and cloud compute infrastructure',
      email: 'billing@google.com',
    },
  });

  const ikoyiClub = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Ikoyi Club 1938',
      serviceDescription: 'Business networking and client entertainment venue',
      email: 'membership@ikoyiclub1938.org',
    },
  });

  const firsVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Federal Inland Revenue Service (FIRS)',
      serviceDescription: 'Federal tax administration and collection agency',
      email: 'helpdesk@firs.gov.ng',
    },
  });

  const cleanerVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Clean & Shine Ltd',
      serviceDescription: 'Office cleaning and facility maintenance',
      phone: '+234 812 345 6789',
      email: 'info@cleanandshine.com',
    },
  });

  const lawVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Aluko & Oyebode',
      serviceDescription: 'Corporate legal representation and consulting',
      contactPerson: 'Gbenga Oyebode',
      email: 'lagos@aluko-oyebode.com',
    },
  });

  const marketingVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Anakle Media Ltd',
      serviceDescription: 'Digital advertising and campaign management',
      email: 'billing@anakle.com',
    },
  });

  const travelVendor = await prisma.vendor.create({
    data: {
      organizationId: acme.id,
      name: 'Wakanow Travel Solutions',
      serviceDescription: 'Corporate travel bookings, flight tickets and hotels',
      email: 'corporate@wakanow.com',
    },
  });

  // Acme Expenses (16 records for realistic data population)
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: rentCat.id,
      vendorId: acmeVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Monthly office rent payment - Q2',
      amount: 450000,
      expenseDate: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'RENT',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: salaryCat.id,
      recordedById: acmeAccountant.id,
      description: 'Staff salaries for current month',
      amount: 1200000,
      expenseDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'SALARIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: softwareCat.id,
      vendorId: googleVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Google Workspace enterprise plan subscriptions',
      amount: 48500,
      expenseDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CARD',
      isDeductible: true,
      taxCategory: 'UTILITIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: utilitiesCat.id,
      vendorId: mtnVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Dedicated office fiber internet (50 Mbps)',
      amount: 85000,
      expenseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'UTILITIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: utilitiesCat.id,
      vendorId: ekoElectricity.id,
      recordedById: acmeAccountant.id,
      description: 'Prepaid electricity grid recharge',
      amount: 120000,
      expenseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paymentMethod: 'PAYSTACK',
      isDeductible: true,
      taxCategory: 'UTILITIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: utilitiesCat.id,
      recordedById: acmeAccountant.id,
      description: 'Diesel purchase for standby generator (400L)',
      amount: 320000,
      expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CASH',
      isDeductible: true,
      taxCategory: 'UTILITIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: officeCat.id,
      vendorId: ikoyiClub.id,
      recordedById: acmeAccountant.id,
      description: 'Executive client entertainment dinner',
      amount: 150005,
      expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CARD',
      isDeductible: false,
      taxCategory: 'NON_DEDUCTIBLE',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: officeCat.id,
      recordedById: acmeAccountant.id,
      description: 'Office stationeries and paper printing supplies',
      amount: 35000,
      expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CASH',
      isDeductible: true,
      taxCategory: 'UNCATEGORIZED',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: professionalCat.id,
      vendorId: lawVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Legal retainer and contract drafting services',
      amount: 250000,
      expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'PROFESSIONAL_FEES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: marketingCat.id,
      vendorId: marketingVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Q2 digital marketing & search ad campaigns',
      amount: 180000,
      expenseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CARD',
      isDeductible: true,
      taxCategory: 'MARKETING',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: transportCat.id,
      vendorId: travelVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Return flight tickets Lagos-Abuja (Sales Pitch)',
      amount: 220000,
      expenseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paymentMethod: 'PAYSTACK',
      isDeductible: true,
      taxCategory: 'TRANSPORT',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: transportCat.id,
      recordedById: acmeAccountant.id,
      description: 'Uber logistics trips for marketing team',
      amount: 28000,
      expenseDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CARD',
      isDeductible: true,
      taxCategory: 'TRANSPORT',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: officeCat.id,
      vendorId: cleanerVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Office janitorial and cleaning services retainer',
      amount: 60000,
      expenseDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'PROFESSIONAL_FEES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: professionalCat.id,
      vendorId: firsVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Federal Inland Revenue Service stamp duty charges',
      amount: 45000,
      expenseDate: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: false,
      taxCategory: 'NON_DEDUCTIBLE',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: softwareCat.id,
      recordedById: acmeAccountant.id,
      description: 'Slack Pro monthly messaging subscription',
      amount: 32400,
      expenseDate: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000),
      paymentMethod: 'CARD',
      isDeductible: true,
      taxCategory: 'UTILITIES',
    },
  });
 
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: professionalCat.id,
      recordedById: acmeAccountant.id,
      description: 'Advanced NestJS backend engineering workshop',
      amount: 150000,
      expenseDate: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'PROFESSIONAL_FEES',
    },
  });
 
  // 15 Uncategorized expenses
  const uncategorizedItems = [
    { description: 'Internet data subscription topup', amount: 15000, categoryId: softwareCat.id, paymentMethod: 'CARD' },
    { description: 'Office drinking water dispenser bottles', amount: 8500, categoryId: officeCat.id, paymentMethod: 'CASH' },
    { description: 'Local courier delivery charges (GIGM)', amount: 12000, categoryId: transportCat.id, paymentMethod: 'CASH' },
    { description: 'Fuel for company car (Oando)', amount: 25000, categoryId: transportCat.id, paymentMethod: 'CARD' },
    { description: 'Lunch meeting with potential client', amount: 42000, categoryId: officeCat.id, paymentMethod: 'CARD' },
    { description: 'Office cleaning detergents and spray', amount: 9500, categoryId: officeCat.id, paymentMethod: 'CASH' },
    { description: 'Standby generator repairs maintenance', amount: 75000, categoryId: utilitiesCat.id, paymentMethod: 'BANK_TRANSFER' },
    { description: 'Printing ink cartridges replacement', amount: 38000, categoryId: officeCat.id, paymentMethod: 'CASH' },
    { description: 'Microsoft 365 license monthly fee', amount: 18500, categoryId: softwareCat.id, paymentMethod: 'CARD' },
    { description: 'Domain name renewal (kulode.app)', amount: 22000, categoryId: softwareCat.id, paymentMethod: 'CARD' },
    { description: 'Toll gate fees (LCC e-tag recharge)', amount: 10000, categoryId: transportCat.id, paymentMethod: 'CARD' },
    { description: 'Postage stamps and mailing envelopes', amount: 6000, categoryId: officeCat.id, paymentMethod: 'CASH' },
    { description: 'A4 copy paper reams box', amount: 28000, categoryId: officeCat.id, paymentMethod: 'CASH' },
    { description: 'Company banner design graphic retainer', amount: 50000, categoryId: marketingCat.id, paymentMethod: 'BANK_TRANSFER' },
    { description: 'Keyboard and mouse office replacements', amount: 30000, categoryId: softwareCat.id, paymentMethod: 'CARD' },
  ];

  for (const item of uncategorizedItems) {
    await prisma.expense.create({
      data: {
        organizationId: acme.id,
        categoryId: item.categoryId,
        recordedById: acmeAccountant.id,
        description: item.description,
        amount: item.amount,
        expenseDate: new Date(Date.now() - Math.floor(Math.random() * 4) * 24 * 60 * 60 * 1000),
        paymentMethod: item.paymentMethod as any,
        isDeductible: false,
        taxCategory: 'UNCATEGORIZED',
      },
    });
  }


  // Acme Invoices Generator (1 to 30 invoices per client)
  console.log('Generating dynamic invoices for clients...');
  let invoiceSeq = 1;
  const statuses = ['PAID', 'PARTIALLY_PAID', 'OVERDUE', 'SENT', 'DRAFT', 'CANCELLED'];

  for (const client of createdClients) {
    const numInvoices = Math.floor(1 + Math.random() * 30); // Between 1 and 30 invoices
    for (let j = 0; j < numInvoices; j++) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const subtotal = Math.floor(50000 + Math.random() * 1450000); // 50k to 1.5M NGN
      const taxRate = 7.5;
      const taxAmount = Math.round(subtotal * 0.075);
      const total = subtotal + taxAmount;
      const amountPaid = status === 'PAID' ? total : (status === 'PARTIALLY_PAID' ? Math.round(total / 2) : 0);

      // Random dates in past 60 days
      const daysAgo = Math.floor(Math.random() * 60);
      const issueDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const dueDate = new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      const padSeq = invoiceSeq.toString().padStart(4, '0');
      const invoiceNum = `ACM-2026-${padSeq}`;
      invoiceSeq++;

      const invoice = await prisma.invoice.create({
        data: {
          organizationId: acme.id,
          clientId: client.id,
          createdById: acmeSuperAdmin.id,
          invoiceNumber: invoiceNum,
          status: status as any,
          issueDate,
          dueDate,
          subtotal,
          discountType: 'PERCENTAGE',
          discountPercent: 0,
          discountAmount: 0,
          taxRate,
          taxAmount,
          total,
          amountPaid,
          notes: 'Thank you for your business.',
        },
      });

      // Link to real services and products randomly
      const randType = Math.random();
      let finalSubtotal = subtotal;
      let finalTaxAmount = taxAmount;
      let finalTotal = total;
      let finalAmountPaid = amountPaid;

      if (randType < 0.45) {
        // Link to ServiceItem
        const service = createdServices[Math.floor(Math.random() * createdServices.length)];
        const qty = Math.floor(1 + Math.random() * 5);
        finalSubtotal = Number(service.unitPrice) * qty;
        finalTaxAmount = Math.round(finalSubtotal * 0.075);
        finalTotal = finalSubtotal + finalTaxAmount;
        finalAmountPaid = status === 'PAID' ? finalTotal : (status === 'PARTIALLY_PAID' ? Math.round(finalTotal / 2) : 0);

        // Update the invoice
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            subtotal: finalSubtotal,
            taxAmount: finalTaxAmount,
            total: finalTotal,
            amountPaid: finalAmountPaid
          }
        });

        await prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            serviceItemId: service.id,
            description: service.name,
            quantity: qty,
            unitPrice: service.unitPrice,
            amount: finalSubtotal,
          },
        });
      } else if (randType < 0.90) {
        // Link to InventoryItem
        const inventory = createdInventory[Math.floor(Math.random() * createdInventory.length)];
        const qty = Math.floor(1 + Math.random() * 3);
        finalSubtotal = Number(inventory.unitPrice) * qty;
        finalTaxAmount = Math.round(finalSubtotal * 0.075);
        finalTotal = finalSubtotal + finalTaxAmount;
        finalAmountPaid = status === 'PAID' ? finalTotal : (status === 'PARTIALLY_PAID' ? Math.round(finalTotal / 2) : 0);

        // Update the invoice
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            subtotal: finalSubtotal,
            taxAmount: finalTaxAmount,
            total: finalTotal,
            amountPaid: finalAmountPaid
          }
        });

        await prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            inventoryItemId: inventory.id,
            description: inventory.name,
            quantity: qty,
            unitPrice: inventory.unitPrice,
            amount: finalSubtotal,
          },
        });
      } else {
        // General custom consulting line item
        await prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: 'Consulting and Support Services',
            quantity: 1,
            unitPrice: subtotal,
            amount: subtotal,
          },
        });
      }

      // Create payment record if paid/partially paid
      if (finalAmountPaid > 0) {
        const methods: ('BANK_TRANSFER' | 'PAYSTACK' | 'CARD' | 'CASH')[] = ['BANK_TRANSFER', 'PAYSTACK', 'CARD', 'CASH'];
        const randMethod = methods[Math.floor(Math.random() * methods.length)];
        
        let reference = null;
        if (randMethod === 'PAYSTACK' || randMethod === 'CARD') {
          reference = `pstk_${Math.random().toString(36).substring(2, 12)}`;
        } else if (randMethod === 'BANK_TRANSFER') {
          reference = `NIP/TXN-${Math.floor(100000 + Math.random() * 900000)}`;
        }

        await prisma.payment.create({
          data: {
            organizationId: acme.id,
            invoiceId: invoice.id,
            amount: finalAmountPaid,
            paymentMethod: randMethod,
            paymentDate: new Date(issueDate.getTime() + 1 * 24 * 60 * 60 * 1000),
            isAutoRecorded: false,
            reference,
          },
        });
      }
    }
  }


  // ─── 2. GLOBEX CORP (BUSINESS PLAN) ─────────────────────────────────────────
  console.log('Seeding Globex Corp...');
  
  const globex = await prisma.organization.create({
    data: {
      name: 'Globex Corporation',
      slug: 'globex-corp',
      email: 'billing@globex.com',
      phone: '+234 810 987 6543',
      address: '456 Globex Tower, Victoria Island, Lagos',
      invoicePrefix: 'GBX',
      currency: 'NGN',
      vatEnabled: true,
      taxRate: 7.5,
      showQrCode: false,
      planTier: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
      trialStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      subscriptionStartDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      subscriptionEndDate: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000),
      paystackSubaccountCode: 'ACCT_globex456',
      isPaystackVerified: true,
    },
  });

  // Globex Users
  const globexAdmin = await prisma.user.create({
    data: {
      organizationId: globex.id,
      email: 'admin@globex.com',
      passwordHash,
      firstName: 'Hank',
      lastName: 'Scorpio',
      role: 'SUPER_ADMIN',
      isEmailVerified: true,
    },
  });

  // Globex Clients
  const globexClient = await prisma.client.create({
    data: {
      organizationId: globex.id,
      name: 'Initech Inc',
      email: 'finance@initech.com',
      phone: '+234 701 123 4567',
      address: 'Office Space 4B, Chevron Drive, Lagos',
    },
  });

  // Globex Invoices (Draft)
  const globexInvoice = await prisma.invoice.create({
    data: {
      organizationId: globex.id,
      clientId: globexClient.id,
      createdById: globexAdmin.id,
      invoiceNumber: 'GBX-2026-0001',
      status: 'DRAFT',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      subtotal: 120000,
      discountType: 'PERCENTAGE',
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 7.5,
      taxAmount: 9000,
      total: 129000,
      amountPaid: 0,
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: globexInvoice.id,
      description: 'Standard IT Setup Support',
      quantity: 1,
      unitPrice: 120000,
      amount: 120000,
    },
  });

  console.log('Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
