import { BillReceipt, charsPerLine, formatBillEscPos } from './bill-escpos';
import { PrintingService } from './printing.service';

const receipt = (overrides: Partial<BillReceipt> = {}): BillReceipt => ({
  receiptNumber: 'ORD-1A2B3',
  createdAt: '2026-11-11T12:00:00.000Z',
  closedAt: null,
  source: 'Dine In',
  table: { name: 'Table 4' },
  customer: null,
  waiter: { firstName: 'Ada', lastName: 'Obi' },
  items: [
    { name: 'Jollof Rice', quantity: 2, unitPrice: 4500, amount: 9000, notes: 'No pepper' },
    { name: 'Chapman', quantity: 1, unitPrice: 3000, amount: 3000 },
  ],
  subtotal: 12000,
  total: 12900,
  amountPaid: 0,
  discountType: 'FIXED',
  discountPercent: 0,
  discountAmount: 0,
  vatApplied: true,
  vatRate: 7.5,
  vatAmount: 900,
  entertainmentTaxApplied: false,
  entertainmentTaxRate: 0,
  entertainmentTaxAmount: 0,
  serviceChargeApplied: false,
  serviceChargeRate: 0,
  serviceChargeAmount: 0,
  payments: [],
  organization: { name: 'The Courtyard', currency: 'NGN', receiptBankName: 'Moniepoint', receiptBankAccountNumber: '0123456789' },
  ...overrides,
});

// The text lines of a docket, with the printer control codes stripped out.
const textLines = (escpos: string) =>
  escpos
    .replace(/\x1b@|\x1b[Ea][\x00\x01]|\x1d[!V][\x00\x01]/g, '')
    .split('\n')
    .filter((line) => line.length > 0);

describe('formatBillEscPos', () => {
  it('prints an unpaid order as a pro forma receipt with the bank details', () => {
    const lines = textLines(formatBillEscPos(receipt()));

    expect(lines).toContain('Pro Forma Receipt');
    expect(lines).toContain('Pay by Transfer');
    expect(lines.find((l) => l.startsWith('2 x Jollof Rice'))).toMatch(/9,000\.00$/);
    expect(lines).toContain('    4,500.00 each');
    expect(lines).toContain('    No pepper');
    expect(lines.find((l) => l.startsWith('VAT 7.5% on 12,000.00'))).toMatch(/900\.00$/);
    expect(lines.find((l) => l.startsWith('TOTAL'))).toMatch(/NGN 12,900\.00$/);
  });

  it('prints a paid order as a receipt with its payments instead of bank details', () => {
    const lines = textLines(
      formatBillEscPos(
        receipt({ amountPaid: 12900, payments: [{ amount: 12900, paymentMethod: 'Cash', paymentDate: '2026-11-11T12:30:00.000Z' }] }),
      ),
    );

    expect(lines).toContain('Receipt');
    expect(lines).not.toContain('Pay by Transfer');
    expect(lines.find((l) => l.startsWith('Cash - '))).toMatch(/12,900\.00$/);
    expect(lines.find((l) => l.startsWith('Paid'))).toMatch(/NGN 12,900\.00$/);
  });

  it.each([80, 58])('never prints a line wider than a %imm roll', (paperWidthMm) => {
    const long = receipt({
      items: [{ name: 'Grilled Atlantic Salmon with Lemon Butter Sauce and Seasonal Vegetables', quantity: 12, unitPrice: 1234567.5, amount: 14814810 }],
      organization: { name: 'A Restaurant With A Very Long Trading Name Indeed Limited', email: 'reservations-and-enquiries@averylongdomainname.example.com' },
    });
    const width = charsPerLine(paperWidthMm);
    for (const line of textLines(formatBillEscPos(long, paperWidthMm))) {
      expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  it('replaces characters a thermal printer cannot print', () => {
    const out = formatBillEscPos(receipt({ items: [{ name: 'Crème brûlée — ₦ special', quantity: 1, unitPrice: 1, amount: 1 }] }));

    expect(out).toContain('1 x Creme brulee - N special');
    // Only plain ASCII and the printer's own control codes.
    expect(/^[\x00-\x7e]*$/.test(out)).toBe(true);
  });
});

describe('PrintingService.queueBill', () => {
  const build = (
    printers: Array<{ id: string; name: string; station: string; paperWidthMm: number }>,
    agentLastSeenAt: Date | null = new Date(),
  ) => {
    const prisma = {
      printer: { findMany: jest.fn().mockResolvedValue(printers) },
      organization: { findUnique: jest.fn().mockResolvedValue({ printAgentLastSeenAt: agentLastSeenAt }) },
      printJob: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `job-${data.printerId}` })) },
    };
    return { prisma, service: new PrintingService(prisma as never) };
  };

  it('reports nothing queued when no printer is set to print bills', async () => {
    const { prisma, service } = build([]);

    await expect(service.queueBill('org-1', receipt(), 'order-1')).resolves.toEqual({ queued: false, printers: [], jobIds: [] });
    expect(prisma.printer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', isActive: true, printsBills: true } }),
    );
    expect(prisma.printJob.create).not.toHaveBeenCalled();
  });

  it('queues nothing while the print agent is offline, so the POS can print another way', async () => {
    const { prisma, service } = build(
      [{ id: 'p1', name: 'Front Desk', station: 'Cashier', paperWidthMm: 80 }],
      new Date(Date.now() - 60 * 60 * 1000),
    );

    await expect(service.queueBill('org-1', receipt(), 'order-1')).resolves.toEqual({
      queued: false,
      agentOffline: true,
      printers: ['Front Desk'],
      jobIds: [],
    });
    expect(prisma.printJob.create).not.toHaveBeenCalled();
  });

  it('queues one job per bill printer, laid out for its paper width', async () => {
    const { prisma, service } = build([{ id: 'p1', name: 'Front Desk', station: 'Cashier', paperWidthMm: 58 }]);

    const result = await service.queueBill('org-1', receipt(), 'order-1');

    expect(result).toEqual({ queued: true, printers: ['Front Desk'], jobIds: ['job-p1'] });
    const { data } = prisma.printJob.create.mock.calls[0][0];
    expect(data).toMatchObject({ orderId: 'order-1', printerId: 'p1', payload: { type: 'BILL', tableName: 'Table 4' } });
    const text = Buffer.from(data.payload.escposText, 'base64').toString('binary');
    expect(text).toContain(`${'-'.repeat(32)}\n`);
    expect(text).not.toContain('-'.repeat(33));
  });
});

describe('PrintingService docket dispatch', () => {
  it('only sends dockets to printers set to print them', async () => {
    const prisma = {
      printer: { findMany: jest.fn().mockResolvedValue([]) },
      printJob: { create: jest.fn() },
    };
    const service = new PrintingService(prisma as never);

    await service.dispatchDocketsForNewItems('org-1', { id: 'order-1', source: 'Dine In' }, [
      { id: 'i1', menuItemId: 'm1', itemName: 'Burger', quantity: 1 },
    ]);

    expect(prisma.printer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', isActive: true, printsDockets: true } }),
    );
    expect(prisma.printJob.create).not.toHaveBeenCalled();
  });
});
