import { Logger } from '@nestjs/common';
import { InvoiceCollectionsSummaryService } from './invoice-collections.summary';

const NOW = new Date('2026-12-14T07:00:00Z');
const T = 'collections_weekly_summary_v1';

function setup() {
  const prisma: any = {
    invoiceCollectionReminder: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    invoiceCollection: { count: jest.fn().mockResolvedValue(0) },
    invoiceCollectionPolicy: { findMany: jest.fn().mockResolvedValue([]) },
    whatsappMessage: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const whatsapp: any = { weeklySummaryTemplateName: T, sendCustomerTemplate: jest.fn().mockResolvedValue({ providerMessageId: 'w' }) };
  return { prisma, whatsapp, service: new InvoiceCollectionsSummaryService(prisma, whatsapp) };
}

describe('InvoiceCollectionsSummaryService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  describe('buildSummary', () => {
    it('counts only payments that arrived after a reminder for that invoice', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionReminder.count.mockResolvedValue(5);
      prisma.payment.findMany.mockResolvedValue([
        { invoiceId: 'a', amount: 100000, paymentDate: new Date('2026-12-10T12:00:00Z') }, // after reminder
        { invoiceId: 'b', amount: 40000, paymentDate: new Date('2026-12-09T12:00:00Z') }, // before the reminder
        { invoiceId: 'c', amount: 25000, paymentDate: new Date('2026-12-11T12:00:00Z') }, // never reminded
      ]);
      prisma.invoiceCollectionReminder.groupBy.mockResolvedValue([
        { invoiceId: 'a', _min: { sentAt: new Date('2026-12-08T09:00:00Z') } },
        { invoiceId: 'b', _min: { sentAt: new Date('2026-12-10T09:00:00Z') } },
      ]);
      prisma.invoice.findMany.mockResolvedValue([{ total: 50000, amountPaid: 20000 }, { total: '10000', amountPaid: '10000' }, { total: 70000, amountPaid: 0 }]);
      prisma.invoiceCollection.count.mockResolvedValue(2);

      expect(await service.buildSummary('org-1', NOW)).toEqual({
        collectedAfterReminders: 100000,
        remindersSent: 5,
        overdueTotal: 100000,
        needsAttention: 2,
      });
    });

    it('looks back exactly seven days and only at overdue open invoices', async () => {
      const { service, prisma } = setup();
      await service.buildSummary('org-1', NOW);
      expect(prisma.invoiceCollectionReminder.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', status: 'SENT', sentAt: { gte: new Date('2026-12-07T07:00:00Z'), lte: NOW } },
      });
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { lt: NOW }, deletedAt: null }) }),
      );
    });
  });

  describe('sendWeeklySummaries', () => {
    const enrolled = (phone: string | null) => [{ organizationId: 'org-1', organization: { name: 'Acme', ownerWhatsappPhone: phone } }];

    it('sends the four figures to every owner number', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567, 08039999999'));
      prisma.invoiceCollectionReminder.count.mockResolvedValue(3);
      prisma.invoiceCollection.count.mockResolvedValue(1);

      expect(await service.sendWeeklySummaries(NOW)).toBe(1);

      expect(whatsapp.sendCustomerTemplate).toHaveBeenCalledTimes(2);
      expect(whatsapp.sendCustomerTemplate).toHaveBeenCalledWith({
        organizationId: 'org-1',
        toPhone: '08031234567',
        templateName: T,
        bodyValues: [expect.stringContaining('0'), '3', expect.stringContaining('0'), '1'],
      });
    });

    it('skips a business with no owner number', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled(null));
      expect(await service.sendWeeklySummaries(NOW)).toBe(0);
      expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    });

    it('does not message twice in the same week', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567'));
      prisma.whatsappMessage.findFirst.mockResolvedValue({ id: 'm1' });
      expect(await service.sendWeeklySummaries(NOW)).toBe(0);
      expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    });

    it('stays quiet in a week with nothing to report', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567'));
      expect(await service.sendWeeklySummaries(NOW)).toBe(0);
      expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    });

    it('a failed earlier attempt does not count as "already sent" this week', async () => {
      const { service, prisma } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567'));
      prisma.invoiceCollectionReminder.count.mockResolvedValue(3);
      await service.sendWeeklySummaries(NOW);
      expect(prisma.whatsappMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { not: 'FAILED' } }) }),
      );
    });

    it('one failing owner number does not stop the next one', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567, 08039999999'));
      prisma.invoiceCollectionReminder.count.mockResolvedValue(3);
      whatsapp.sendCustomerTemplate.mockRejectedValueOnce(new Error('bad number')).mockResolvedValue({ providerMessageId: 'w' });
      expect(await service.sendWeeklySummaries(NOW)).toBe(1);
      expect(whatsapp.sendCustomerTemplate).toHaveBeenCalledTimes(2);
    });

    it('counts a business as messaged only if at least one number got it', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue(enrolled('08031234567'));
      prisma.invoiceCollectionReminder.count.mockResolvedValue(3);
      whatsapp.sendCustomerTemplate.mockRejectedValue(new Error('Meta down'));
      expect(await service.sendWeeklySummaries(NOW)).toBe(0);
    });

    it('one business failing does not stop the others', async () => {
      const { service, prisma, whatsapp } = setup();
      prisma.invoiceCollectionPolicy.findMany.mockResolvedValue([
        { organizationId: 'org-1', organization: { name: 'A', ownerWhatsappPhone: '0803' } },
        { organizationId: 'org-2', organization: { name: 'B', ownerWhatsappPhone: '0804' } },
      ]);
      prisma.invoiceCollectionReminder.count.mockResolvedValue(2);
      whatsapp.sendCustomerTemplate.mockRejectedValueOnce(new Error('Meta down')).mockResolvedValue({ providerMessageId: 'w' });
      expect(await service.sendWeeklySummaries(NOW)).toBe(1);
    });
  });
});
