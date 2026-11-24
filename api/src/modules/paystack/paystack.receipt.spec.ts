import { Logger } from '@nestjs/common';
import { PaystackService } from './paystack.service';

function setup(enrolled: boolean) {
  const prisma: any = { invoiceCollectionPolicy: { findFirst: jest.fn().mockResolvedValue(enrolled ? { id: 'pol-1' } : null) } };
  const whatsapp: any = { sendPaymentReceiptTemplate: jest.fn().mockResolvedValue({ providerMessageId: 'wamid.1' }) };
  const config: any = { get: () => undefined };
  const service: any = new PaystackService(config, prisma, {} as any, {} as any, whatsapp);
  return { prisma, whatsapp, send: (invoice: any) => service.sendWhatsappReceipt(invoice, 20000, '₦30,000.00') };
}

const invoice = (client: Record<string, unknown> = {}) => ({
  organizationId: 'org-1',
  invoiceNumber: 'INV-0214',
  client: { name: 'Emeka', phone: '08031234567', whatsappOptIn: true, whatsappOptedOutAt: null, ...client },
});

describe('WhatsApp payment receipt', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('sends the amount paid and the balance left to an opted-in customer of an enrolled business', async () => {
    const { whatsapp, send } = setup(true);
    await send(invoice());
    expect(whatsapp.sendPaymentReceiptTemplate).toHaveBeenCalledWith({
      organizationId: 'org-1',
      toPhone: '08031234567',
      clientName: 'Emeka',
      amountPaid: expect.stringContaining('20,000'),
      invoiceNumber: 'INV-0214',
      balanceLeft: '₦30,000.00',
    });
  });

  it.each([
    ['no consent', { whatsappOptIn: false }],
    ['opted out', { whatsappOptedOutAt: new Date() }],
    ['no phone', { phone: null }],
  ])('sends nothing when the customer has %s', async (_n, over) => {
    const { whatsapp, send } = setup(true);
    await send(invoice(over));
    expect(whatsapp.sendPaymentReceiptTemplate).not.toHaveBeenCalled();
  });

  it('sends nothing for a business that has not switched on automatic reminders', async () => {
    const { whatsapp, send } = setup(false);
    await send(invoice());
    expect(whatsapp.sendPaymentReceiptTemplate).not.toHaveBeenCalled();
  });

  it('never throws when WhatsApp fails (the payment is already recorded)', async () => {
    const { whatsapp, send } = setup(true);
    whatsapp.sendPaymentReceiptTemplate.mockRejectedValue(new Error('Meta down'));
    await expect(send(invoice())).resolves.toBeUndefined();
  });
});
