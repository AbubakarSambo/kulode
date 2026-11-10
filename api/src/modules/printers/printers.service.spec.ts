import { NotFoundException } from '@nestjs/common';
import { PrintersService, normalizePairingCode } from './printers.service';

describe('PrintersService print agent pairing', () => {
  const organization = { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() };
  const service = new PrintersService({ organization } as any);

  beforeEach(() => jest.resetAllMocks());

  it('ignores case, dashes and spaces in a typed code', () => {
    expect(normalizePairingCode(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('issues a readable code that expires', async () => {
    organization.update.mockResolvedValue({});
    const before = Date.now();

    const { code, expiresAt } = await service.createPairingCode('org-1');

    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(before);
    expect(organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { printAgentPairingCode: normalizePairingCode(code), printAgentPairingExpiresAt: expiresAt },
    });
  });

  it('hands back the existing token so agents already running stay connected', async () => {
    organization.findFirst.mockResolvedValue({ id: 'org-1', name: 'Courtyard', printAgentToken: 'existing-token' });
    organization.update.mockResolvedValue({});

    const result = await service.redeemPairingCode('abcd-2345');

    expect(result).toEqual({ token: 'existing-token', organizationName: 'Courtyard' });
    expect(organization.findFirst.mock.calls[0][0].where.printAgentPairingCode).toBe('ABCD2345');
    // Single use: the code is cleared as it is redeemed.
    expect(organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { printAgentToken: 'existing-token', printAgentPairingCode: null, printAgentPairingExpiresAt: null },
    });
  });

  it('creates a token the first time an organization pairs', async () => {
    organization.findFirst.mockResolvedValue({ id: 'org-1', name: 'Courtyard', printAgentToken: null });
    organization.update.mockResolvedValue({});

    const { token } = await service.redeemPairingCode('ABCD2345');

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(organization.update.mock.calls[0][0].data.printAgentToken).toBe(token);
  });

  it('only looks for codes that have not expired, and rejects anything else', async () => {
    organization.findFirst.mockResolvedValue(null);

    await expect(service.redeemPairingCode('ABCD2345')).rejects.toBeInstanceOf(NotFoundException);

    expect(organization.findFirst.mock.calls[0][0].where.printAgentPairingExpiresAt.gt).toBeInstanceOf(Date);
    expect(organization.update).not.toHaveBeenCalled();
  });

  it('rejects an empty code without querying', async () => {
    await expect(service.redeemPairingCode(' - ')).rejects.toBeInstanceOf(NotFoundException);
    expect(organization.findFirst).not.toHaveBeenCalled();
  });

  it('reports the agent online only when it checked in recently', async () => {
    organization.findUniqueOrThrow.mockResolvedValue({ printAgentToken: 't', printAgentLastSeenAt: new Date(Date.now() - 10_000) });
    expect(await service.getAgentStatus('org-1')).toMatchObject({ hasToken: true, online: true });

    organization.findUniqueOrThrow.mockResolvedValue({ printAgentToken: 't', printAgentLastSeenAt: new Date(Date.now() - 10 * 60_000) });
    expect(await service.getAgentStatus('org-1')).toMatchObject({ online: false });

    organization.findUniqueOrThrow.mockResolvedValue({ printAgentToken: null, printAgentLastSeenAt: null });
    expect(await service.getAgentStatus('org-1')).toEqual({ hasToken: false, lastSeenAt: null, online: false });
  });
});
