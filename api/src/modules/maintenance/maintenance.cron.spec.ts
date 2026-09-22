import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceCron } from './maintenance.cron';
import { PrismaService } from '../prisma';

describe('MaintenanceCron', () => {
  let cron: MaintenanceCron;
  let prisma: { idempotencyKey: { deleteMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { idempotencyKey: { deleteMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MaintenanceCron, { provide: PrismaService, useValue: prisma }],
    }).compile();

    cron = module.get<MaintenanceCron>(MaintenanceCron);
  });

  describe('cleanupIdempotencyKeys', () => {
    it('deletes idempotency keys older than the retention window', async () => {
      prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 5 });

      await cron.cleanupIdempotencyKeys();

      const call = prisma.idempotencyKey.deleteMany.mock.calls[0][0];
      const cutoff: Date = call.where.createdAt.lt;
      const daysAgo = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysAgo).toBeCloseTo(30, 0);
    });

    it('does not throw when the delete fails', async () => {
      prisma.idempotencyKey.deleteMany.mockRejectedValue(new Error('DB unavailable'));

      await expect(cron.cleanupIdempotencyKeys()).resolves.toBeUndefined();
    });
  });
});
