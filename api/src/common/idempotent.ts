import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../modules/prisma/prisma.service';

/** Normalizes Decimal/Date-bearing Prisma results into a plain JSON value for storage. */
function toJsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Wraps a transactional mutation with idempotency-key enforcement so a retried request (e.g.
 * an offline-queue flush after a flaky connection, or a user double-tapping a button) is
 * provably a no-op rather than re-executed. The key row is created inside the same transaction
 * as the mutation — the unique constraint on (organizationId, action, key) wins any concurrent
 * race, not a check-then-act read. If a prior attempt inserted the key but crashed before
 * storing a result snapshot, we surface a 409 rather than silently re-running the mutation.
 */
export async function runIdempotent<T>(
  prisma: PrismaService,
  organizationId: string,
  action: string,
  key: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { organizationId, action, key } });
      const result = await fn(tx);
      await tx.idempotencyKey.update({
        where: { organizationId_action_key: { organizationId, action, key } },
        data: { resultSnapshot: toJsonSnapshot(result) },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { organizationId_action_key: { organizationId, action, key } },
      });
      if (existing?.resultSnapshot) {
        return existing.resultSnapshot as T;
      }
      throw new ConflictException(
        'A request with this clientRequestId is already being processed — retry shortly',
      );
    }
    throw error;
  }
}
