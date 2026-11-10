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

describe('PrintersService printer discovery', () => {
  const organization = { findUniqueOrThrow: jest.fn(), update: jest.fn() };
  const printer = { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
  const service = new PrintersService({ organization, printer } as any);
  const MAC = 'a4:5e:60:c1:22:9b';

  beforeEach(() => {
    jest.resetAllMocks();
    organization.update.mockResolvedValue({});
    printer.update.mockResolvedValue({});
  });

  it('corrects a saved printer whose hardware address turns up at a new IP', async () => {
    printer.findMany.mockResolvedValue([{ id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', port: 9100, macAddress: MAC }]);

    const result = await service.recordDiscovery('org-1', [{ ipAddress: '192.168.1.87', port: 9100, macAddress: MAC }]);

    expect(printer.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { ipAddress: '192.168.1.87' } });
    expect(result).toEqual({ received: 1, corrected: 1 });
  });

  it('leaves a printer alone when it is where it should be, or was not seen at all', async () => {
    printer.findMany.mockResolvedValue([
      { id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', port: 9100, macAddress: MAC },
      { id: 'p2', name: 'Bar', ipAddress: '192.168.1.60', port: 9100, macAddress: 'a4:5e:60:00:00:01' },
    ]);

    const result = await service.recordDiscovery('org-1', [{ ipAddress: '192.168.1.50', port: 9100, macAddress: MAC }]);

    expect(printer.update).not.toHaveBeenCalled();
    expect(result.corrected).toBe(0);
  });

  it('does not guess when one hardware address answers at two IPs', async () => {
    printer.findMany.mockResolvedValue([{ id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', port: 9100, macAddress: MAC }]);

    await service.recordDiscovery('org-1', [
      { ipAddress: '192.168.1.87', port: 9100, macAddress: MAC },
      { ipAddress: '192.168.1.88', port: 9100, macAddress: MAC },
    ]);

    expect(printer.update).not.toHaveBeenCalled();
  });

  it('learns the hardware address of a printer that was added by typing its IP', async () => {
    printer.findMany.mockResolvedValue([{ id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', port: null, macAddress: null }]);

    await service.recordDiscovery('org-1', [{ ipAddress: '192.168.1.50', port: 9100, macAddress: MAC }]);

    expect(printer.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { macAddress: MAC } });
  });

  it('stores the scan and clears the pending request', async () => {
    printer.findMany.mockResolvedValue([]);

    await service.recordDiscovery('org-1', [{ ipAddress: '192.168.1.50', port: 9100 }]);

    const { data } = organization.update.mock.calls[0][0];
    expect(data.printAgentDiscovered).toEqual([{ ipAddress: '192.168.1.50', port: 9100, macAddress: null }]);
    expect(data.printAgentScanRequestedAt).toBeNull();
    expect(data.printAgentDiscoveredAt).toBeInstanceOf(Date);
  });

  it('marks found devices that are already saved, matching by hardware address before IP', async () => {
    organization.findUniqueOrThrow.mockResolvedValue({
      printAgentScanRequestedAt: null,
      printAgentDiscoveredAt: new Date(),
      printAgentDiscovered: [
        { ipAddress: '192.168.1.87', port: 9100, macAddress: MAC },
        { ipAddress: '192.168.1.60', port: 9100, macAddress: null },
        { ipAddress: '192.168.1.99', port: 9100, macAddress: 'a4:5e:60:00:00:09' },
      ],
    });
    printer.findMany.mockResolvedValue([
      { id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', port: 9100, macAddress: MAC },
      { id: 'p2', name: 'Bar', ipAddress: '192.168.1.60', port: null, macAddress: null },
    ]);

    const { scanning, devices } = await service.getDiscovery('org-1');

    expect(scanning).toBe(false);
    expect(devices.map((d) => d.printerName)).toEqual(['Kitchen', 'Bar', null]);
  });

  it('forgets the learned hardware address when someone types a different IP', async () => {
    printer.findFirst.mockResolvedValue({ id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', macAddress: MAC });

    await service.update('org-1', 'p1', { ipAddress: '192.168.1.70' });

    expect(printer.update.mock.calls[0][0].data).toMatchObject({ ipAddress: '192.168.1.70', macAddress: null });
  });

  it('keeps the hardware address on edits that do not touch the IP', async () => {
    printer.findFirst.mockResolvedValue({ id: 'p1', name: 'Kitchen', ipAddress: '192.168.1.50', macAddress: MAC });

    await service.update('org-1', 'p1', { station: 'Grill', ipAddress: '192.168.1.50' });

    expect(printer.update.mock.calls[0][0].data).not.toHaveProperty('macAddress');
  });
});
