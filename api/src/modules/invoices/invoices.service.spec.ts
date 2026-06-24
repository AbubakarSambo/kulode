import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';

import { InventoryService } from '../inventory/inventory.service';
import { PaystackService } from '../paystack/paystack.service';
import { EmailService } from '../email/email.service';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  const prismaInstance = {
    client: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    invoice: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    invoiceItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    paymentInstallment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prismaInstance.$transaction.mockImplementation((cb: any) => cb(prismaInstance));
  return prismaInstance;
}

const ORG_ID = 'org-abc-123';
const USER_ID = 'user-abc-123';
const CLIENT_ID = 'client-abc-123';

const mockClient = { id: CLIENT_ID, organizationId: ORG_ID, name: 'Acme Ltd', isActive: true };

const mockInvoice = {
  id: 'inv-1',
  organizationId: ORG_ID,
  invoiceNumber: 'INV-2026-0001',
  status: 'DRAFT',
  issueDate: new Date('2026-02-01'),
  dueDate: new Date('2026-03-01'),
  subtotal: '100',
  discountType: 'PERCENTAGE',
  discountPercent: '0',
  discountAmount: '0',
  taxRate: '0',
  taxAmount: '0',
  total: '100',
  amountPaid: '0',
  notes: null,
  terms: null,
  paymentUrl: null,
  paystackReference: null,
  paystackAccessCode: null,
  paystackPaidAt: null,
  paystackChannel: null,
  shareToken: null,
  client: mockClient,
  items: [],
  installments: [],
};

const baseCreateDto = {
  clientId: CLIENT_ID,
  issueDate: new Date('2026-02-01'),
  dueDate: new Date('2026-03-01'),
  items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
};

function orgWith(overrides: object) {
  return {
    invoicePrefix: 'INV',
    vatEnabled: false,
    taxRate: '0',
    defaultNotes: null,
    paymentTerms: null,
    planTier: 'FREE',
    subscriptionStatus: 'ACTIVE',
    trialEndDate: null,
    isGrandfathered: false,
    ...overrides,
  };
}

// Sets up a full happy-path mock so tests that expect no ForbiddenException can run through
function setupHappyPathMocks(prisma: ReturnType<typeof createMockPrisma>, org: object) {
  prisma.client.findFirst.mockResolvedValue(mockClient);
  prisma.organization.findUnique.mockResolvedValue(org);
  prisma.invoice.findFirst.mockResolvedValue(null); // generateInvoiceNumber → sequence 1
  prisma.invoice.create.mockResolvedValue(mockInvoice);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InvoicesService — invoice limit enforcement', () => {
  let service: InvoicesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: InventoryService,
          useValue: {
            reserveForInvoice: jest.fn(),
            releaseReservation: jest.fn(),
          },
        },
        {
          provide: PaystackService,
          useValue: {
            initializeTransaction: jest.fn(),
            initializeInstallmentTransaction: jest.fn(),
            verifyTransaction: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordSetupEmail: jest.fn(),
            sendMagicLinkEmail: jest.fn(),
            sendAddPasswordEmail: jest.fn(),
            sendClientReminderEmail: jest.fn(),
            sendInvoiceReminderEmail: jest.fn(),
            sendRenewalFailedEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
            sendInvoiceEmail: jest.fn(),
            sendPaymentReceiptEmail: jest.fn(),
            sendMerchantPaymentAlertEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  // ─── Client not found ─────────────────────────────────────────────────────

  it('throws NotFoundException when client does not belong to organization', async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toThrow(NotFoundException);
  });

  // ─── Grandfathered ───────────────────────────────────────────────────────

  it('does not enforce invoice limits for grandfathered orgs', async () => {
    const org = orgWith({ planTier: 'FREE', isGrandfathered: true });
    setupHappyPathMocks(prisma, org);
    // count is NOT called — limit check is skipped entirely
    await service.create(ORG_ID, USER_ID, baseCreateDto as any);
    expect(prisma.invoice.count).not.toHaveBeenCalled();
  });

  // ─── FREE plan limits ────────────────────────────────────────────────────

  it('allows invoice creation when FREE plan is under the 5-invoice limit', async () => {
    const org = orgWith({ planTier: 'FREE' });
    setupHappyPathMocks(prisma, org);
    prisma.invoice.count.mockResolvedValue(4);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).resolves.toBeDefined();
  });

  it('throws INVOICE_LIMIT_REACHED when FREE plan reaches 5 invoices', async () => {
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.invoice.count.mockResolvedValue(5);

    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVOICE_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 5,
        current: 5,
      }),
    });
  });

  it('throws INVOICE_LIMIT_REACHED when FREE plan exceeds 5 invoices', async () => {
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.invoice.count.mockResolvedValue(6);

    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toThrow(ForbiddenException);
  });

  // ─── PRO plan limits ─────────────────────────────────────────────────────

  it('allows invoice creation when ACTIVE PRO plan is under the 100-invoice limit', async () => {
    const org = orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' });
    setupHappyPathMocks(prisma, org);
    prisma.invoice.count.mockResolvedValue(99);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).resolves.toBeDefined();
  });

  it('throws INVOICE_LIMIT_REACHED when ACTIVE PRO plan reaches 100 invoices', async () => {
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' }));
    prisma.invoice.count.mockResolvedValue(100);

    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVOICE_LIMIT_REACHED',
        currentPlan: 'PRO',
        limit: 100,
      }),
    });
  });

  // ─── BUSINESS plan limits ─────────────────────────────────────────────────

  it('never enforces invoice limits for ACTIVE BUSINESS plan (unlimited)', async () => {
    const org = orgWith({ planTier: 'BUSINESS', subscriptionStatus: 'ACTIVE' });
    setupHappyPathMocks(prisma, org);
    prisma.invoice.count.mockResolvedValue(999);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).resolves.toBeDefined();
  });

  // ─── Trial scenarios ──────────────────────────────────────────────────────

  it('applies PRO limits during an active trial (PRO plan, trial not yet expired)', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const org = orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: futureDate });
    setupHappyPathMocks(prisma, org);
    prisma.invoice.count.mockResolvedValue(99);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).resolves.toBeDefined();
  });

  it('drops to FREE limits when PRO trial has expired (TRIALING + past end date)', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: pastDate }),
    );
    prisma.invoice.count.mockResolvedValue(6); // above FREE limit, below PRO limit

    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVOICE_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 5,
      }),
    });
  });

  it('applies FREE limits when subscription status is EXPIRED', async () => {
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'EXPIRED' }),
    );
    prisma.invoice.count.mockResolvedValue(6);

    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVOICE_LIMIT_REACHED',
        currentPlan: 'FREE',
      }),
    });
  });

  it('allows invoice when expired BUSINESS org is under FREE limit (5 invoices)', async () => {
    const org = orgWith({ planTier: 'BUSINESS', subscriptionStatus: 'EXPIRED' });
    setupHappyPathMocks(prisma, org);
    prisma.invoice.count.mockResolvedValue(4);
    await expect(service.create(ORG_ID, USER_ID, baseCreateDto as any)).resolves.toBeDefined();
  });

  // ─── Only this month's invoices count ────────────────────────────────────

  it('queries invoice count with a start-of-month filter (not all-time)', async () => {
    prisma.client.findFirst.mockResolvedValue(mockClient);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.invoice.count.mockResolvedValue(0);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.invoice.create.mockResolvedValue(mockInvoice);

    await service.create(ORG_ID, USER_ID, baseCreateDto as any);

    const countCall = prisma.invoice.count.mock.calls[0][0];
    expect(countCall.where).toMatchObject({
      organizationId: ORG_ID,
      deletedAt: null,
      createdAt: { gte: expect.any(Date) },
    });
    // The gte date should be the first of the current month at midnight
    const gte: Date = countCall.where.createdAt.gte;
    expect(gte.getDate()).toBe(1);
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
  });
});
