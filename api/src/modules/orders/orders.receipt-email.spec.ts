import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OrdersController } from './orders.controller';

const receipt = (over: Record<string, unknown> = {}) => ({
  receiptNumber: 'ORD-AB12C',
  status: 'CLOSED_PAID',
  createdAt: new Date('2026-11-20T12:00:00Z'),
  closedAt: new Date('2026-11-20T13:00:00Z'),
  total: 12500,
  organization: { name: 'The Courtyard', currency: 'NGN' },
  ...over,
});

function setup(r = receipt()) {
  const orders: any = { getReceiptData: jest.fn().mockResolvedValue(r) };
  const pdf: any = { generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const email: any = { sendOrderReceiptEmail: jest.fn().mockResolvedValue(undefined) };
  const controller = new OrdersController(orders, pdf, {} as any, email);
  return { controller, orders, pdf, email };
}

describe('POST orders/:id/receipt/email', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('emails the receipt PDF for a paid order, scoped to the caller\'s organization', async () => {
    const { controller, orders, email } = setup();
    await expect(controller.emailReceipt('org-1', 'ord-1', { email: 'ada@example.com' })).resolves.toEqual({ sent: true });
    expect(orders.getReceiptData).toHaveBeenCalledWith('org-1', 'ord-1');
    expect(email.sendOrderReceiptEmail).toHaveBeenCalledWith(
      'ada@example.com',
      'The Courtyard',
      'ORD-AB12C',
      expect.stringContaining('12,500'),
      expect.stringContaining('2026'),
      Buffer.from('pdf'),
    );
  });

  it.each(['OPEN', 'CLOSED_UNPAID', 'CANCELLED'])('refuses an order that is %s', async (status) => {
    const { controller, email } = setup(receipt({ status }));
    await expect(controller.emailReceipt('org-1', 'ord-1', { email: 'a@b.co' })).rejects.toBeInstanceOf(BadRequestException);
    expect(email.sendOrderReceiptEmail).not.toHaveBeenCalled();
  });

  it('tells the cashier when the email could not be sent', async () => {
    const { controller, email } = setup();
    email.sendOrderReceiptEmail.mockRejectedValue(new Error('Resend down'));
    await expect(controller.emailReceipt('org-1', 'ord-1', { email: 'a@b.co' })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
