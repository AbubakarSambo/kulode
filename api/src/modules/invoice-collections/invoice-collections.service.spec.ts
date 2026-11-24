import { Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoiceCollectionsService } from './invoice-collections.service';
import { DEFAULT_SCHEDULE } from './invoice-collections.schedule';

const NOW = new Date('2026-12-10T10:00:00Z'); // 11:00 in Lagos, outside quiet hours
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

const client = (over: Record<string, unknown> = {}) => ({
  id: 'client-1',
  name: 'Emeka',
  phone: '08031234567',
  whatsappOptIn: true,
  whatsappOptedOutAt: null,
  ...over,
});

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  invoiceNumber: 'INV-0214',
  status: 'SENT',
  deletedAt: null,
  total: 250000,
  amountPaid: 0,
  shareToken: 'tok',
  dueDate: new Date('2026-12-10T00:00:00Z'),
  client: client(),
  organization: { timezone: 'Africa/Lagos' },
  ...over,
});

const collection = (over: Record<string, unknown> = {}) => ({
  invoiceId: 'inv-1',
  organizationId: 'org-1',
  state: 'REMINDING',
  stepIndex: 1,
  messagesSent: 0,
  nextActionAt: new Date('2026-12-10T08:00:00Z'),
  invoice: invoice(),
  ...over,
});

const policy = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  organizationId: 'org-1',
  clientId: null,
  schedule: DEFAULT_SCHEDULE,
  mode: 'AUTO',
  sendHour: 9,
  maxMessages: 4,
  paused: false,
  ...over,
});

function setup() {
  const prisma: any = {
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    invoiceCollection: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    invoiceCollectionPolicy: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    invoiceCollectionReminder: {
      create: jest.fn().mockResolvedValue({ id: 'rem-1' }),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const whatsapp: any = { sendInvoiceReminderTemplate: jest.fn().mockResolvedValue({ providerMessageId: 'wamid.1' }) };
  const service = new InvoiceCollectionsService(prisma, whatsapp);
  return { prisma, whatsapp, service };
}

/** Wires a single due collection so processDue() reaches it. */
function withDue(prisma: any, c: any, p: any) {
  prisma.invoiceCollection.findMany.mockResolvedValue([{ invoiceId: c.invoiceId }]);
  prisma.invoiceCollection.findUnique.mockResolvedValue(c);
  prisma.invoiceCollectionPolicy.findFirst.mockImplementation(({ where }: any) =>
    Promise.resolve(where.clientId === null ? p : null),
  );
}

describe('InvoiceCollectionsService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('processDue', () => {
    it('AUTO mode: plans the step, advances to the next one and sends', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy());
      prisma.invoiceCollectionReminder.findUnique.mockResolvedValue({
        id: 'rem-1', organizationId: 'org-1', invoice: invoice(),
      });

      await service.processDue(NOW);

      expect(prisma.invoiceCollectionReminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ invoiceId: 'inv-1', stepIndex: 1, template: 'due' }),
      });
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: expect.objectContaining({
          stepIndex: 2,
          state: 'REMINDING',
          nextActionAt: new Date('2026-12-13T08:00:00.000Z'), // due date + 3 days, 09:00 Lagos
        }),
      });
      expect(whatsapp.sendInvoiceReminderTemplate).toHaveBeenCalledTimes(1);
      expect(whatsapp.sendInvoiceReminderTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ toPhone: '08031234567', invoiceNumber: 'INV-0214', shareToken: 'tok' }),
      );
      expect(prisma.invoiceCollectionReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-1' },
        data: expect.objectContaining({ status: 'SENT', providerMessageId: 'wamid.1' }),
      });
      expect(prisma.invoiceCollection.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: { messagesSent: { increment: 1 } },
      });
    });

    it('APPROVE mode: plans and advances but sends nothing until the owner approves', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy({ mode: 'APPROVE' }));

      await service.processDue(NOW);

      expect(prisma.invoiceCollectionReminder.create).toHaveBeenCalledTimes(1);
      expect(prisma.invoiceCollection.update).toHaveBeenCalled();
      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
    });

    it('does not send twice when the step was already planned by another run', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy());
      prisma.invoiceCollectionReminder.create.mockRejectedValue(uniqueViolation());

      await service.processDue(NOW);

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stepIndex: 2 }) }),
      );
    });

    it('hands the invoice to the owner after the last step instead of looping', async () => {
      const { service, prisma } = setup();
      withDue(prisma, collection({ stepIndex: 3 }), policy({ mode: 'APPROVE' }));

      await service.processDue(NOW);

      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: expect.objectContaining({ stepIndex: 4, state: 'OWNER_ATTENTION', nextActionAt: null }),
      });
    });

    it.each([
      ['has no phone number', { phone: null }],
      ['has not opted in', { whatsappOptIn: false }],
      ['has opted out', { whatsappOptedOutAt: new Date('2026-12-01T00:00:00Z') }],
    ])('flags the owner and sends nothing when the customer %s', async (_label, clientOver) => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection({ invoice: invoice({ client: client(clientOver) }) }), policy());

      await service.processDue(NOW);

      expect(prisma.invoiceCollectionReminder.create).not.toHaveBeenCalled();
      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: expect.objectContaining({ state: 'OWNER_ATTENTION', nextActionAt: null }),
      });
    });

    it('stops at the message cap', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection({ messagesSent: 4 }), policy({ maxMessages: 4 }));

      await service.processDue(NOW);

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: 'OWNER_ATTENTION' }) }),
      );
    });

    it('defers to the next send hour during quiet hours', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy());

      await service.processDue(new Date('2026-12-10T21:30:00Z')); // 22:30 Lagos

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollectionReminder.create).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: { nextActionAt: new Date('2026-12-11T08:00:00.000Z') },
      });
    });

    it('does nothing for a paused policy, so reminders resume when it is unpaused', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy({ paused: true }));

      await service.processDue(NOW);

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).not.toHaveBeenCalled();
    });

    it('closes an invoice that was paid before its next reminder', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection({ invoice: invoice({ status: 'PAID' }) }), policy());

      await service.processDue(NOW);

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollection.update).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1' },
        data: expect.objectContaining({ state: 'PAID', nextActionAt: null }),
      });
    });

    it('uses a client-specific policy over the business default', async () => {
      const { service, prisma, whatsapp } = setup();
      withDue(prisma, collection(), policy());
      prisma.invoiceCollectionPolicy.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.clientId === 'client-1' ? policy({ clientId: 'client-1', paused: true }) : policy()),
      );

      await service.processDue(NOW);

      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
    });

    it('drops queued reminders and closes collections for finished invoices on every tick', async () => {
      const { service, prisma } = setup();

      await service.processDue(NOW);

      expect(prisma.invoiceCollection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'PAID', nextActionAt: null } }),
      );
      expect(prisma.invoiceCollectionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING_APPROVAL' }), data: { status: 'SKIPPED' } }),
      );
    });
  });

  describe('sendReminder', () => {
    const pending = (inv = invoice()) => ({ id: 'rem-1', organizationId: 'org-1', invoice: inv });

    it('claims the reminder so a second call cannot send it again', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionReminder.updateMany.mockResolvedValue({ count: 0 }); // already claimed

      const result = await service.sendReminder('rem-1');

      expect(result).toEqual({ sent: false, reason: 'not_pending' });
      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
    });

    it('skips at send time when the invoice was paid after the reminder was planned', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionReminder.findUnique.mockResolvedValue(pending(invoice({ status: 'PAID' })));

      const result = await service.sendReminder('rem-1');

      expect(result).toEqual({ sent: false, reason: 'invoice_closed' });
      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
      expect(prisma.invoiceCollectionReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-1' },
        data: { status: 'SKIPPED', errorMessage: 'invoice_closed' },
      });
    });

    it('skips at send time when the customer opted out in the meantime', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionReminder.findUnique.mockResolvedValue(
        pending(invoice({ client: client({ whatsappOptedOutAt: new Date() }) })),
      );

      const result = await service.sendReminder('rem-1');

      expect(result).toEqual({ sent: false, reason: 'no_consent' });
      expect(whatsapp.sendInvoiceReminderTemplate).not.toHaveBeenCalled();
    });

    it('asks for the outstanding balance, not the invoice total, on a part-paid invoice', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionReminder.findUnique.mockResolvedValue(
        pending(invoice({ status: 'PARTIALLY_PAID', amountPaid: 100000 })),
      );

      await service.sendReminder('rem-1');

      const { amountDue } = whatsapp.sendInvoiceReminderTemplate.mock.calls[0][0];
      expect(amountDue.replace(/[^0-9]/g, '')).toBe('15000000'); // 150,000.00
    });

    it('records a failure without throwing and does not count it as sent', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionReminder.findUnique.mockResolvedValue(pending());
      whatsapp.sendInvoiceReminderTemplate.mockRejectedValue(new Error('Meta rejected the template'));

      const result = await service.sendReminder('rem-1');

      expect(result).toEqual({ sent: false, reason: 'send_failed' });
      expect(prisma.invoiceCollectionReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-1' },
        data: { status: 'FAILED', errorMessage: 'Meta rejected the template' },
      });
      expect(prisma.invoiceCollection.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { messagesSent: { increment: 1 } } }),
      );
    });
  });

  describe('owner actions', () => {
    it('approve rejects a reminder from another organization', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionReminder.findFirst.mockResolvedValue(null);

      await expect(service.approveReminder('org-2', 'rem-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoiceCollectionReminder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rem-1', organizationId: 'org-2' } }),
      );
    });

    it('skip only touches a pending reminder in the caller\'s organization', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionReminder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.skipReminder('org-1', 'rem-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoiceCollectionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rem-1', organizationId: 'org-1', status: 'PENDING_APPROVAL' } }),
      );
    });
  });

  describe('enrollEligibleInvoices', () => {
    const enrolledPolicy = { ...policy(), organization: { timezone: 'Africa/Lagos' } };

    it('enrols an invoice at the first step that has not passed', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue([enrolledPolicy]);
      prisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1', dueDate: new Date('2026-12-10T00:00:00Z') }]);

      const count = await service.enrollEligibleInvoices(NOW);

      expect(count).toBe(1);
      expect(prisma.invoiceCollection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: 'inv-1',
          state: 'SCHEDULED',
          stepIndex: 1, // the -2 day step is already past
          nextActionAt: new Date('2026-12-10T08:00:00.000Z'),
        }),
      });
    });

    it('marks an invoice whose whole schedule has passed as needing the owner, without sending', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue([enrolledPolicy]);
      prisma.invoice.findMany.mockResolvedValue([{ id: 'inv-9', dueDate: new Date('2026-11-27T00:00:00Z') }]);

      await service.enrollEligibleInvoices(NOW);

      expect(prisma.invoiceCollection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ state: 'OWNER_ATTENTION', nextActionAt: null }),
      });
    });

    it('only looks at open invoices without a collection row, and skips old debt', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue([enrolledPolicy]);

      await service.enrollEligibleInvoices(NOW);

      const { where } = prisma.invoice.findMany.mock.calls[0][0];
      expect(where.status).toEqual({ in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] });
      expect(where.collection).toEqual({ is: null });
      expect(where.deletedAt).toBeNull();
      expect(where.dueDate.gte).toEqual(new Date('2026-11-26T10:00:00.000Z')); // 14 days back
    });

    it('ignores an invoice another run already enrolled', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue([enrolledPolicy]);
      prisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1', dueDate: new Date('2026-12-10T00:00:00Z') }]);
      prisma.invoiceCollection.create.mockRejectedValue(uniqueViolation());

      await expect(service.enrollEligibleInvoices(NOW)).resolves.toBe(0);
    });
  });
});
