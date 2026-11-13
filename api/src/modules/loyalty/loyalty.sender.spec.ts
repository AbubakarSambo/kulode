import { Logger } from '@nestjs/common';
import { LoyaltySender } from './loyalty.sender';

interface Row {
  id: string;
  organization_id: string;
  customer_id: string;
  kind: 'WELCOME' | 'REWARD_EARNED';
  payload: unknown;
  attempts: number;
}

const row = (over: Partial<Row> = {}): Row => ({ id: 'm1', organization_id: 'org-1', customer_id: 'c1', kind: 'REWARD_EARNED', payload: { rewardText: 'a free Jollof', expiryText: '12 February 2027' }, attempts: 1, ...over });

function setup(opts: { enabled?: boolean; rows?: Row[]; customer?: Record<string, unknown> | null; sendError?: Error; rules?: unknown[] } = {}) {
  const rows = opts.rows ?? [row()];
  const prisma: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    // claim(): first the due ids, then the claimed rows
    $queryRaw: jest.fn().mockResolvedValueOnce(rows.map((r) => ({ id: r.id }))).mockResolvedValueOnce(rows),
    organization: { findUnique: jest.fn().mockResolvedValue({ name: 'The Living Room', currency: 'NGN', phoneCountry: 'NG', loyaltyEnabled: true }) },
    customer: {
      findUnique: jest.fn().mockResolvedValue(
        opts.customer === undefined ? { name: 'Amaka', phone: '+2348031234569', isMember: true, messageConsentAt: new Date() } : opts.customer,
      ),
    },
    loyaltyRewardRule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? []) },
    loyaltyMessage: { update: jest.fn().mockResolvedValue({}) },
  };
  const whatsapp: any = {
    sendCustomerTemplate: jest.fn(async () => {
      if (opts.sendError) throw opts.sendError;
      return { providerMessageId: 'wamid.1', messageId: 'wa-row-1' };
    }),
  };
  const config: any = { get: (k: string) => ({ 'whatsapp.loyaltyMessagesEnabled': opts.enabled ?? true }[k]) };
  return { prisma, whatsapp, sender: new LoyaltySender(prisma, whatsapp, config) };
}

describe('LoyaltySender', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const logged = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => String(c[0]));

  it('sends the reward message and logs that WhatsApp accepted it, by our message id and with no personal details', async () => {
    const { sender, whatsapp, prisma } = setup();
    await sender.run();
    expect(whatsapp.sendCustomerTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'loyalty_reward_earned_v1', toPhone: '+2348031234569', bodyValues: ['Amaka', 'The Living Room', 'a free Jollof', '12 February 2027'] }),
    );
    expect(prisma.loyaltyMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', providerMessageId: 'wamid.1' }) }));
    const lines = logged(log);
    // the line carries our WhatsApp record id, which is what Meta's later delivery-status lines are keyed by
    expect(lines.some((l) => l.includes('REWARD_EARNED message m1') && l.includes('SENT to WhatsApp as loyalty_reward_earned_v1 (WhatsApp record wa-row-1)'))).toBe(true);
    // WhatsApp's own message id encodes the recipient's number, so it is not logged
    expect(lines.join(' ')).not.toContain('wamid');
    expect(lines.some((l) => l.includes('1 picked up — 1 sent, 0 skipped, 0 will retry, 0 failed'))).toBe(true);
    // never the phone number or the customer's name
    expect([...lines, ...logged(warn)].join(' ')).not.toMatch(/2348031234569|Amaka/);
  });

  it('says so when it is in mock mode (nothing really sent)', async () => {
    const { sender, whatsapp } = setup();
    whatsapp.sendCustomerTemplate.mockResolvedValue({ providerMessageId: null, messageId: 'wa-row-2' });
    await sender.run();
    expect(logged(log).some((l) => l.includes('mock mode'))).toBe(true);
  });

  it.each([
    ['no consent', { name: 'A', phone: '+2348031234569', isMember: true, messageConsentAt: null }, 'No message consent recorded'],
    ['no valid number', { name: 'A', phone: '090xxxx', isMember: true, messageConsentAt: new Date() }, 'No valid phone number'],
    ['not a member', { name: 'A', phone: '+2348031234569', isMember: false, messageConsentAt: new Date() }, 'Loyalty is off or the customer is not a member'],
  ])('skips and logs the reason when there is %s', async (_label, customer, reason) => {
    const { sender, whatsapp, prisma } = setup({ customer });
    await sender.run();
    expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    expect(prisma.loyaltyMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SKIPPED', lastError: reason } }));
    expect(logged(warn).some((l) => l.includes('SKIPPED') && l.includes(reason))).toBe(true);
    expect(logged(log).some((l) => l.includes('0 sent, 1 skipped'))).toBe(true);
  });

  it('skips a welcome when the organization does not have exactly two active rewards, and says why', async () => {
    const { sender, whatsapp } = setup({ rows: [row({ kind: 'WELCOME', payload: null })], rules: [{ name: 'Only', thresholdAmount: 5000, items: [{ menuItem: { name: 'Jollof' } }] }] });
    await sender.run();
    expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    expect(logged(warn).some((l) => l.includes('WELCOME') && l.includes('exactly two active rewards'))).toBe(true);
  });

  it('a failed send retries until the last attempt, then fails for good; the error text is logged', async () => {
    const timeout = new Error('Failed to communicate with WhatsApp API');
    const first = setup({ sendError: timeout, rows: [row({ attempts: 1 })] });
    await first.sender.run();
    expect(first.prisma.loyaltyMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastError: timeout.message } })); // stays PENDING
    expect(logged(warn).some((l) => l.includes('will retry (attempt 1 of 3)') && l.includes(timeout.message))).toBe(true);

    const last = setup({ sendError: timeout, rows: [row({ attempts: 3 })] });
    await last.sender.run();
    expect(last.prisma.loyaltyMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'FAILED', lastError: timeout.message } }));
    expect(logged(warn).some((l) => l.includes('FAILED for good'))).toBe(true);
    expect(logged(log).some((l) => l.includes('0 sent, 0 skipped, 0 will retry, 1 failed'))).toBe(true);
  });

  it('sends nothing while the switch is off', async () => {
    const { sender, whatsapp, prisma } = setup({ enabled: false });
    await sender.run();
    expect(whatsapp.sendCustomerTemplate).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled(); // not even claimed
  });
});
