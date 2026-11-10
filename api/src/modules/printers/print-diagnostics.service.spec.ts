import { NotFoundException } from '@nestjs/common';
import { PrintDiagnosticsService } from './print-diagnostics.service';

describe('PrintDiagnosticsService', () => {
  const prisma = {
    organization: { findUnique: jest.fn() },
    printJob: { groupBy: jest.fn(), findMany: jest.fn() },
    printAgentLog: { createMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  };
  const printersService = { getAgentStatus: jest.fn(), getDiscovery: jest.fn(), findAll: jest.fn(), requestScan: jest.fn() };
  const printingService = { queueTestPrint: jest.fn() };
  const service = new PrintDiagnosticsService(prisma as any, printersService as any, printingService as any);

  beforeEach(() => jest.resetAllMocks());

  it('stores uploaded agent log lines under the organization and prunes old ones', async () => {
    const result = await service.recordAgentLogs('org-1', [{ at: '2026-11-10T18:00:00.000Z', message: 'Printed job 1' }]);

    expect(prisma.printAgentLog.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: 'org-1', loggedAt: new Date('2026-11-10T18:00:00.000Z'), message: 'Printed job 1' }],
    });
    const prune = prisma.printAgentLog.deleteMany.mock.calls[0][0].where;
    expect(prune.organizationId).toBe('org-1');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(prune.createdAt.lt.getTime() - sevenDaysAgo)).toBeLessThan(5000);
    expect(result).toEqual({ received: 1 });
  });

  it('rejects an unknown organization', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.getDiagnostics('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pulls agent, printers, jobs and log together, scoped to the one organization', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Courtyard', printAgentVersion: '1.3.0', printAgentHostname: 'BAR-PC' });
    printersService.getAgentStatus.mockResolvedValue({ hasToken: true, lastSeenAt: new Date(), online: true });
    printersService.getDiscovery.mockResolvedValue({ scanning: false, scannedAt: null, devices: [] });
    printersService.findAll.mockResolvedValue([
      { id: 'p1', name: 'Kitchen', station: 'Kitchen', connectionType: 'NETWORK', ipAddress: '192.168.1.50', port: 9100, devicePath: null, macAddress: null, isActive: true, categories: [{ category: { name: 'Grill' } }] },
    ]);
    const printedAt = new Date('2026-11-10T17:00:00Z');
    prisma.printJob.groupBy.mockResolvedValue([{ printerId: 'p1', _max: { printedAt } }]);
    prisma.printJob.findMany.mockResolvedValue([
      { id: 'j2', orderId: null, status: 'FAILED', error: 'Printer connection timed out', attempts: 1, createdAt: new Date(), printedAt: null, payload: { type: 'TEST' }, printer: { id: 'p1', name: 'Kitchen' } },
      { id: 'j1', orderId: 'o1', status: 'SENT', error: null, attempts: 1, createdAt: new Date(), printedAt, payload: { tableName: 'T4' }, printer: { id: 'p1', name: 'Kitchen' } },
    ]);
    prisma.printAgentLog.findMany.mockResolvedValue([{ id: 'l1', loggedAt: new Date(), message: 'starting' }]);

    const d = await service.getDiagnostics('org-1');

    expect(d.agent).toMatchObject({ online: true, version: '1.3.0', hostname: 'BAR-PC' });
    expect(d.printers[0]).toMatchObject({ name: 'Kitchen', routes: ['Grill'], lastPrintedAt: printedAt });
    expect(d.jobs.map((j) => [j.type, j.status, j.tableName])).toEqual([['TEST', 'FAILED', null], ['NEW', 'SENT', 'T4']]);
    expect(d.logs).toHaveLength(1);
    // Every query is limited to this organization — a platform admin must never see another's jobs here.
    expect(prisma.printJob.findMany.mock.calls[0][0].where).toEqual({ printer: { organizationId: 'org-1' } });
    expect(prisma.printJob.groupBy.mock.calls[0][0].where).toEqual({ status: 'SENT', printer: { organizationId: 'org-1' } });
    expect(prisma.printAgentLog.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1' });
  });

  it('queues a test print for the given organization and printer', async () => {
    printingService.queueTestPrint.mockResolvedValue({ jobId: 'j9' });
    expect(await service.testPrint('org-1', 'p1', 'admin@example.com')).toEqual({ jobId: 'j9' });
    expect(printingService.queueTestPrint).toHaveBeenCalledWith('org-1', 'p1');
  });
});
