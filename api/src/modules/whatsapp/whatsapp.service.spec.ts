import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { InboundHandlingError, WhatsappService } from './whatsapp.service';

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

describe('WhatsappService inbound messages and webhook signatures', () => {
  const SECRET = 'app-secret';
  const build = (secret = SECRET) => {
    const prisma: any = { whatsappMessage: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const config: any = { get: (k: string) => (k === 'whatsapp.appSecret' ? secret : undefined) };
    return new WhatsappService(config, prisma);
  };
  const sign = (body: Buffer, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const inboundEvent = { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.in', from: '2348031234567', type: 'text', text: { body: 'I will pay tomorrow' }, context: { id: 'wamid.out' } }] } }] }] };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the right signature and rejects a wrong, missing or malformed one', () => {
    const service = build();
    const body = Buffer.from('{"a":1}');
    expect(service.isValidSignature(body, sign(body))).toBe(true);
    expect(service.isValidSignature(body, sign(body, 'other-secret'))).toBe(false);
    expect(service.isValidSignature(Buffer.from('{"a":2}'), sign(body))).toBe(false);
    expect(service.isValidSignature(body, undefined)).toBe(false);
    expect(service.isValidSignature(body, 'sha256=zz')).toBe(false);
    expect(service.isValidSignature(undefined, sign(body))).toBe(false);
  });

  it('cannot verify anything when no secret is configured', () => {
    const service = build('');
    expect(service.canVerifySignatures).toBe(false);
    expect(service.isValidSignature(Buffer.from('x'), 'sha256=00')).toBe(false);
  });

  it('passes an authentic customer message to subscribers', async () => {
    const service = build();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.onInboundMessage(handler);
    await service.handleWebhookEvent(inboundEvent, { acceptInbound: true });
    expect(handler).toHaveBeenCalledWith({ providerMessageId: 'wamid.in', from: '2348031234567', type: 'text', text: 'I will pay tomorrow', contextId: 'wamid.out' });
  });

  it('does not pass on a message whose signature was not verified', async () => {
    const service = build();
    const handler = jest.fn();
    service.onInboundMessage(handler);
    await service.handleWebhookEvent(inboundEvent);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a failing subscriber is reported after the rest of the webhook was handled, so Meta can redeliver', async () => {
    const service = build();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    service.onInboundMessage(jest.fn().mockRejectedValue(new Error('boom')));
    service.onInboundMessage(second);
    await expect(service.handleWebhookEvent(inboundEvent, { acceptInbound: true })).rejects.toBeInstanceOf(InboundHandlingError);
    expect(second).toHaveBeenCalledTimes(1); // other subscribers still ran
  });
});
