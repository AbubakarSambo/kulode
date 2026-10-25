import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

// No RESEND_API_KEY → mock mode; the private sendEmail is spied on to read the rendered HTML.
function makeService() {
  const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService);
  const send = jest.spyOn(service as any, 'sendEmail').mockResolvedValue(undefined);
  const html = () => (send.mock.lastCall![0] as { html: string }).html;
  return { service, html };
}

describe('EmailService — POS wording matches how the org sells', () => {
  it('speaks to a retail store about its till and products, never menus or tables', async () => {
    const { service, html } = makeService();
    const emails: Array<() => Promise<void>> = [
      () => service.sendVerificationEmail('a@b.ng', 'Ada', 'tok', 'RETAIL'),
      () => service.sendTrialEndingWarningEmail('a@b.ng', 'Ada', 5, 'RETAIL'),
      () => service.sendTrialExpiredEmail('a@b.ng', 'Ada', 'RETAIL'),
      () => service.sendRenewalFailedEmail('a@b.ng', 'Ada', 'PRO', 'RETAIL'),
    ];
    for (const send of emails) {
      await send();
      expect(html()).not.toMatch(/menu|tables|floor/i);
    }
    await service.sendVerificationEmail('a@b.ng', 'Ada', 'tok', 'RETAIL');
    expect(html()).toContain('run your store');
  });

  it('keeps restaurant wording as the default (posMode omitted)', async () => {
    const { service, html } = makeService();
    await service.sendVerificationEmail('a@b.ng', 'Ada', 'tok');
    expect(html()).toContain('managing your menu and tables');
    await service.sendTrialExpiredEmail('a@b.ng', 'Ada');
    expect(html()).toContain('taking orders and running your floor');
  });

  it("quotes the Starter price from PLAN_PRICES rather than a hard-coded figure", async () => {
    const { service, html } = makeService();
    await service.sendTrialExpiredEmail('a@b.ng', 'Ada');
    expect(html()).toMatch(/Starter plan at just ₦20,000\/month/);
  });
});
