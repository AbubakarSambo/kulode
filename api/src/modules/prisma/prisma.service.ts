import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
