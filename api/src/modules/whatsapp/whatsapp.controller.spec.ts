import { InternalServerErrorException, Logger } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { InboundHandlingError } from './whatsapp.service';

function setup(handle: jest.Mock) {
  const service: any = { canVerifySignatures: false, handleWebhookEvent: handle };
  return new WhatsappController(service);
}
const call = (c: WhatsappController) => c.receiveWebhook({}, { rawBody: Buffer.from('{}') } as any, undefined);

describe('WhatsappController webhook', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('acknowledges a processed event', async () => {
    await expect(call(setup(jest.fn().mockResolvedValue(undefined)))).resolves.toEqual({ received: true });
  });

  it('answers 5xx when a customer message could not be processed, so Meta redelivers it', async () => {
    const c = setup(jest.fn().mockRejectedValue(new InboundHandlingError('db blip')));
    await expect(call(c)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('still answers 200 for any other processing error, so a bad payload cannot cause endless retries', async () => {
    const c = setup(jest.fn().mockRejectedValue(new Error('unexpected shape')));
    await expect(call(c)).resolves.toEqual({ received: true });
  });
});
