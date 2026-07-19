import { Test, TestingModule } from '@nestjs/testing';
import { TaxService } from './tax.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const ORG_ID = 'org-abc-123';

function createMockPrisma() {
  return {
    expense: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    taxReportLog: { create: jest.fn(), findMany: jest.fn() },
  };
}

const START = new Date('2026-01-01');
const END = new Date('2026-12-31');

// ─── getDeductibleSummary ─────────────────────────────────────────────────────

describe('TaxService — getDeductibleSummary', () => {
  let service: TaxService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TaxService>(TaxService);
    jest.clearAllMocks();
  });

  it('returns zero totals when there are no deductible expenses', async () => {
    prisma.expense.findMany.mockResolvedValue([]);
    const result = await service.getDeductibleSummary(ORG_ID, 2026);
    expect(result.total).toBe(0);
    expect(result.byCategory).toHaveLength(0);
    expect(result.year).toBe(2026);
  });

  it('correctly sums expenses across multiple categories', async () => {
    prisma.expense.findMany.mockResolvedValue([
      { taxCategory: 'RENT', amount: '50000' },
      { taxCategory: 'RENT', amount: '30000' },
      { taxCategory: 'UTILITIES', amount: '20000' },
    ]);
    const result = await service.getDeductibleSummary(ORG_ID, 2026);
    expect(result.total).toBe(100000);
    const rent = result.byCategory.find((c) => c.category === 'RENT');
    const utilities = result.byCategory.find((c) => c.category === 'UTILITIES');
    expect(rent?.total).toBe(80000);
    expect(rent?.count).toBe(2);
    expect(utilities?.total).toBe(20000);
    expect(utilities?.count).toBe(1);
  });

  it('uses the correct human-readable label for known categories', async () => {
    prisma.expense.findMany.mockResolvedValue([
      { taxCategory: 'PROFESSIONAL_FEES', amount: '10000' },
    ]);
    const result = await service.getDeductibleSummary(ORG_ID, 2026);
    expect(result.byCategory[0].label).toBe('Professional Fees');
  });

  it('falls back to the raw category key for unknown categories', async () => {
    prisma.expense.findMany.mockResolvedValue([
      { taxCategory: 'MYSTERY_CATEGORY', amount: '5000' },
    ]);
    const result = await service.getDeductibleSummary(ORG_ID, 2026);
    expect(result.byCategory[0].label).toBe('MYSTERY_CATEGORY');
  });

  it('queries only expenses for the given year with tenantId scoped', async () => {
    prisma.expense.findMany.mockResolvedValue([]);
    await service.getDeductibleSummary(ORG_ID, 2026);
    const call = prisma.expense.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG_ID);
    expect(call.where.isDeductible).toBe(true);
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.expenseDate.gte).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(call.where.expenseDate.lte).toEqual(new Date('2026-12-31T23:59:59.999Z'));
  });
});

// ─── getFilingPackPreview — tax calculations ───────────────────────────────────

describe('TaxService — getFilingPackPreview: tax calculations', () => {
  let service: TaxService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TaxService>(TaxService);
    jest.clearAllMocks();
  });

  function setupMocks({
    invoices = [],
    expenses = [],
    orgOverrides = {},
  }: {
    invoices?: object[];
    expenses?: object[];
    orgOverrides?: object;
  }) {
    prisma.organization.findUnique.mockResolvedValue({
      name: 'Test Org',
      email: 'test@org.com',
      address: null,
      vatEnabled: true,
      taxRate: '7.5',
      phone: '08012345678',
      ...orgOverrides,
    });
    prisma.invoice.findMany.mockResolvedValue(invoices);
    prisma.expense.findMany.mockResolvedValue(expenses);
  }

  it('computes VAT collected as the sum of taxAmount on PAID invoices only', async () => {
    setupMocks({
      invoices: [
        { status: 'PAID', amountPaid: '10000', total: '10000', taxAmount: '750', invoiceNumber: 'INV-001', issueDate: new Date(), dueDate: new Date(), client: { name: 'A' } },
        { status: 'DRAFT', amountPaid: '0', total: '5000', taxAmount: '375', invoiceNumber: 'INV-002', issueDate: new Date(), dueDate: new Date(), client: { name: 'B' } },
      ],
    });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    // Only PAID invoice's taxAmount should count
    expect(result.tax.vatCollected).toBe(750);
  });

  it('calculates net VAT liability = vatCollected - (totalDeductible * 0.075)', async () => {
    setupMocks({
      invoices: [
        { status: 'PAID', amountPaid: '20000', total: '20000', taxAmount: '1500', invoiceNumber: 'INV-001', issueDate: new Date(), dueDate: new Date(), client: { name: 'A' } },
      ],
      expenses: [
        { isDeductible: true, taxCategory: 'RENT', amount: '10000', expenseDate: new Date(), paymentMethod: 'CASH', description: 'Rent', reference: null, notes: null, vendor: null, category: null },
      ],
    });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    // vatPaidOnExpenses = 10000 * 0.075 = 750
    expect(result.tax.vatPaidOnExpenses).toBeCloseTo(750);
    // netVatLiability = 1500 - 750 = 750
    expect(result.tax.netVatLiability).toBeCloseTo(750);
  });

  it('marks CIT as 0% exempt when total revenue is at or below ₦100M threshold', async () => {
    setupMocks({
      invoices: [
        { status: 'PAID', amountPaid: '100000000', total: '100000000', taxAmount: '0', invoiceNumber: 'INV-001', issueDate: new Date(), dueDate: new Date(), client: { name: 'A' } },
      ],
    });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    expect(result.tax.citStatus).toContain('0%');
    expect(result.tax.citAmount).toBe(0);
  });

  it('applies 30% CIT on taxable profit when revenue exceeds ₦100M threshold', async () => {
    setupMocks({
      invoices: [
        { status: 'PAID', amountPaid: '200000000', total: '200000000', taxAmount: '0', invoiceNumber: 'INV-001', issueDate: new Date(), dueDate: new Date(), client: { name: 'A' } },
      ],
      expenses: [
        { isDeductible: true, taxCategory: 'RENT', amount: '50000000', expenseDate: new Date(), paymentMethod: 'CASH', description: 'Rent', reference: null, notes: null, vendor: null, category: null },
      ],
    });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    // taxableProfit = 200M - 50M = 150M; CIT = 150M * 0.3 = 45M
    expect(result.tax.citAmount).toBeCloseTo(45000000);
    expect(result.tax.citStatus).toContain('30%');
  });

  it('always scopes expense and invoice queries to organizationId (tenantId isolation)', async () => {
    setupMocks({});
    await service.getFilingPackPreview(ORG_ID, START, END);
    const invoiceCall = prisma.invoice.findMany.mock.calls[0][0];
    const expenseCall = prisma.expense.findMany.mock.calls[0][0];
    expect(invoiceCall.where.organizationId).toBe(ORG_ID);
    expect(expenseCall.where.organizationId).toBe(ORG_ID);
  });

  it('compliance: TIN check is ok when org has a TIN on file', async () => {
    setupMocks({ orgOverrides: { tin: '12345678-0001' } });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    const tinItem = result.compliance.find((c) => c.id === 'tin');
    expect(tinItem?.status).toBe('ok');
  });

  it('compliance: TIN check warns when org has no TIN, even with phone and email', async () => {
    setupMocks({ orgOverrides: { tin: null, phone: '09011223344', email: 'a@b.com' } });
    const result = await service.getFilingPackPreview(ORG_ID, START, END);
    const tinItem = result.compliance.find((c) => c.id === 'tin');
    expect(tinItem?.status).toBe('warn');
  });
});
