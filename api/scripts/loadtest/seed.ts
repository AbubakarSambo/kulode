/**
 * Seeds N simulated restaurants for a load test, each with the sales demo's menu, tables, staff and
 * 90 days of order history (DemoSeedService), plus a kitchen printer and a print agent token. Writes
 * the IDs and pre-signed tokens the k6 script needs to LOADTEST_OUT.
 *
 * Every org it touches is slug `loadtest-NNN` and flagged isTestAccount; cleanup.ts removes them.
 *
 *   DATABASE_URL=<staging public url> JWT_SECRET=<staging secret> \
 *   LOADTEST_ALLOW_HOST=<the DB host, typed out> LOADTEST_OUT=orgs.json \
 *   LOADTEST_COUNT=100 LOADTEST_CONCURRENCY=4 \
 *   npx ts-node -r tsconfig-paths/register scripts/loadtest/seed.ts
 *
 * LOADTEST_ALLOW_HOST must equal the DATABASE_URL host, so pointing this at the wrong database
 * takes a deliberate second step rather than a stale env var.
 */
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../src/modules/prisma/prisma.service';
import { DemoSeedService, SeedTarget } from '../../src/modules/demo/demo-seed.service';

export const LOADTEST_SLUG_PREFIX = 'loadtest-';

export function targetFor(n: number): SeedTarget {
  const id = String(n).padStart(3, '0');
  return {
    slug: `${LOADTEST_SLUG_PREFIX}${id}`,
    name: `Loadtest Restaurant ${id}`,
    adminEmail: `admin.${id}@loadtest.tarione.com`,
    staffEmailDomain: `r${id}.loadtest.tarione.com`,
  };
}

export function assertAllowedHost() {
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!host || host !== process.env.LOADTEST_ALLOW_HOST) {
    throw new Error(`DATABASE_URL host "${host}" does not match LOADTEST_ALLOW_HOST — refusing to run`);
  }
}

async function seedOne(prisma: PrismaService, seeder: DemoSeedService, n: number, secret: string) {
  const target = targetFor(n);
  const { organizationId, staff } = await seeder.seedTestOrg(target);

  // A kitchen printer for every category, so new orders produce print jobs for the agent to claim.
  await prisma.printer.deleteMany({ where: { organizationId } });
  const printer = await prisma.printer.create({
    data: { organizationId, name: 'Kitchen', station: 'Kitchen', connectionType: 'NETWORK', ipAddress: '10.0.0.50' },
  });
  const categories = await prisma.menuCategory.findMany({ where: { organizationId }, select: { id: true } });
  await prisma.menuCategoryPrinter.createMany({ data: categories.map((c) => ({ categoryId: c.id, printerId: printer.id })) });

  const printAgentToken = `lt_${randomBytes(24).toString('hex')}`;
  await prisma.organization.update({ where: { id: organizationId }, data: { printAgentToken } });

  const [admin, tables, menuItems] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: staff.adminId }, select: { id: true, email: true, roles: true } }),
    prisma.restaurantTable.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.menuItem.findMany({ where: { organizationId }, select: { id: true } }),
  ]);
  const token = jwt.sign({ sub: admin.id, email: admin.email, organizationId, roles: admin.roles }, secret, { expiresIn: '7d' });

  return {
    n,
    organizationId,
    token,
    printAgentToken,
    waiterIds: staff.waiterIds,
    tableIds: tables.map((t) => t.id),
    menuItemIds: menuItems.map((m) => m.id),
  };
}

async function main() {
  assertAllowedHost();
  const secret = process.env.JWT_SECRET;
  const out = process.env.LOADTEST_OUT;
  if (!secret || !out) throw new Error('JWT_SECRET and LOADTEST_OUT are required');
  const count = Number(process.env.LOADTEST_COUNT ?? 100);
  const start = Number(process.env.LOADTEST_START ?? 1);
  const concurrency = Number(process.env.LOADTEST_CONCURRENCY ?? 4);

  const prisma = new PrismaService();
  await prisma.$connect();
  const seeder = new DemoSeedService(prisma);

  const existing: { n: number }[] = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const results = new Map(existing.map((r) => [r.n, r]));
  const queue = Array.from({ length: count }, (_, i) => start + i);
  const started = Date.now();

  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      const t0 = Date.now();
      const row = await seedOne(prisma, seeder, n, secret);
      results.set(n, row);
      // Rewritten after every org so a crash halfway keeps what's done (re-running reseeds the rest).
      fs.writeFileSync(out, JSON.stringify([...results.values()].sort((a, b) => a.n - b.n), null, 2));
      console.log(`seeded ${targetFor(n).slug} in ${((Date.now() - t0) / 1000).toFixed(0)}s (${results.size} total)`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log(`done: ${count} orgs in ${((Date.now() - started) / 60000).toFixed(1)} min → ${out}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
