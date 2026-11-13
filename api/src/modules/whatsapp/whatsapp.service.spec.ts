import { Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

const WAMID = 'wamid.HBgNMjM0OTA1MzAxODAwNRUCABEY'; // encodes the recipient's number

function setup(known: { id: string; templateName: string } | null = { id: 'msg-1', templateName: 'loyalty_reward_earned_v1' }) {
  const prisma: any = {
    whatsappMessage: {
      findUnique: jest.fn().mockResolvedValue(known),
      updateMany: jest.fn().mockResolvedValue({ count: known ? 1 : 0 }),
    },
  };
  const config: any = { get: () => undefined };
  return { prisma, service: new WhatsappService(config, prisma) };
}

const statusEvent = (status: string, errors?: unknown[]) => ({ entry: [{ changes: [{ value: { statuses: [{ id: WAMID, status, ...(errors ? { errors } : {}) }] } }] }] });

describe('WhatsappService delivery status callbacks', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  const text = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => String(c[0])).join('\n');

  it('records the status and logs it by our message id, never WhatsApp\'s id', async () => {
    const { service, prisma } = setup();
    await service.handleWebhookEvent(statusEvent('delivered'));
    expect(prisma.whatsappMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { providerMessageId: WAMID }, data: expect.objectContaining({ status: 'DELIVERED' }) }));
    expect(text(log)).toContain('WhatsApp loyalty_reward_earned_v1 message msg-1: Meta reports DELIVERED');
    expect(text(log) + text(warn)).not.toContain('wamid');
  });

  it('logs a failure as a warning with Meta\'s error code and reason', async () => {
    const { service, prisma } = setup();
    await service.handleWebhookEvent(statusEvent('failed', [{ code: 131049, title: 'This message was not delivered to maintain healthy ecosystem engagement.' }]));
    expect(prisma.whatsappMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: '131049' }) }),
    );
    expect(text(warn)).toContain('message msg-1: Meta reports FAILED (error 131049: This message was not delivered to maintain healthy ecosystem engagement.)');
  });

  it('still records a status for a message it has no row for (and does not crash)', async () => {
    const { service } = setup(null);
    await expect(service.handleWebhookEvent(statusEvent('sent'))).resolves.toBeUndefined();
    expect(text(log)).not.toContain('Meta reports');
  });

  it('ignores status values it does not recognise', async () => {
    const { service, prisma } = setup();
    await service.handleWebhookEvent(statusEvent('typing'));
    expect(prisma.whatsappMessage.updateMany).not.toHaveBeenCalled();
  });
});
