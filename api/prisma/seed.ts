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

  const acmeClient1 = createdClients[0];
  const acmeClient2 = createdClients[1];

  // Acme Service Items
  const acmeService1 = await prisma.serviceItem.create({
    data: {
      organizationId: acme.id,
      name: 'Software Development Consulting',
      description: 'Senior Software Architecture and engineering consulting per hour',
      unitPrice: 75000,
    },
  });

  const acmeService2 = await prisma.serviceItem.create({
    data: {
      organizationId: acme.id,
      name: 'Cloud Infrastructure Audit',
      description: 'Comprehensive review of AWS/GCP setups and cost optimization report',
      unitPrice: 350000,
    },
  });

  // Acme Inventory Items
  const acmeInventory1 = await prisma.inventoryItem.create({
    data: {
      organizationId: acme.id,
      name: 'Dell XPS 15 Laptop',
      description: 'Core i7, 32GB RAM, 1TB SSD developer workstation laptop',
      unitPrice: 1800000,
      onHandQuantity: 15,
      reservedQuantity: 2,
      reorderLevel: 3,
      sku: 'DELL-XPS15-01',
    },
  });

  const acmeInventory2 = await prisma.inventoryItem.create({
    data: {
      organizationId: acme.id,
      name: 'Logitech MX Master 3S Mouse',
      description: 'Ergonomic wireless mouse for developers',
      unitPrice: 95000,
      onHandQuantity: 40,
      reservedQuantity: 0,
      reorderLevel: 5,
      sku: 'LOGI-MX3S-02',
    },
  });

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

  // Acme Expenses
  await prisma.expense.create({
    data: {
      organizationId: acme.id,
      categoryId: rentCat.id,
      vendorId: acmeVendor.id,
      recordedById: acmeAccountant.id,
      description: 'Monthly office rent payment - Q2',
      amount: 450000,
      expenseDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
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
      description: 'Staff salaries for April',
      amount: 1200000,
      expenseDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      paymentMethod: 'BANK_TRANSFER',
      isDeductible: true,
      taxCategory: 'SALARIES',
    },
  });

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

      // Create line item
      await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: 'Consulting and Support Services',
          quantity: 1,
          unitPrice: subtotal,
          amount: subtotal,
        },
      });

      // Create payment record if paid/partially paid
      if (amountPaid > 0) {
        await prisma.payment.create({
          data: {
            organizationId: acme.id,
            invoiceId: invoice.id,
            amount: amountPaid,
            paymentMethod: 'BANK_TRANSFER',
            paymentDate: new Date(issueDate.getTime() + 1 * 24 * 60 * 60 * 1000),
            isAutoRecorded: false,
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
