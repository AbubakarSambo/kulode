import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// Transient connection failures observed against the Railway TCP proxy (P1001 "can't reach
// database server", P1002 connection timed out, P1017 server closed the connection). Retrying
// these masks brief proxy/network blips instead of surfacing a 500 to the client.
const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P1017']);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
      datasources: { db: { url: PrismaService.buildDatabaseUrl() } },
    });

    this.$use(async (params, next) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await next(params);
        } catch (error) {
          const isRetryable =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            RETRYABLE_ERROR_CODES.has(error.code);
          if (!isRetryable || attempt >= MAX_RETRY_ATTEMPTS) throw error;
          this.logger.warn(
            `Retrying ${params.model}.${params.action} after transient DB error (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${(error as Prisma.PrismaClientKnownRequestError).code}`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
        }
      }
    });
  }

  // Prisma's default pool size (num_physical_cpus * 2 + 1) is unbounded by any awareness of how
  // many other instances/replicas share the same Postgres connection limit — on a small hosted
  // Postgres plan that can exhaust connections platform-wide under concurrent load. Caps it
  // explicitly per instance; override with DATABASE_CONNECTION_LIMIT once the real Postgres plan's
  // max_connections and expected replica count are known.
  private static buildDatabaseUrl(): string {
    const base = process.env.DATABASE_URL;
    if (!base || /[?&]connection_limit=/.test(base)) return base as string;
    const limit = process.env.DATABASE_CONNECTION_LIMIT ?? '10';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}connection_limit=${limit}`;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
