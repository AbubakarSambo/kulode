/**
 * Removes every org seed.ts created (slug `loadtest-*`, isTestAccount) along with its data.
 *
 *   DATABASE_URL=<staging public url> LOADTEST_ALLOW_HOST=<the DB host> \
 *   npx ts-node -r tsconfig-paths/register scripts/loadtest/cleanup.ts
 */
import 'reflect-metadata';
import { PrismaService } from '../../src/modules/prisma/prisma.service';
import { DemoSeedService } from '../../src/modules/demo/demo-seed.service';
import { LOADTEST_SLUG_PREFIX, assertAllowedHost } from './seed';

async function main() {
  assertAllowedHost();
  const prisma = new PrismaService();
  await prisma.$connect();
  const seeder = new DemoSeedService(prisma);

  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: LOADTEST_SLUG_PREFIX }, isTestAccount: true },
    select: { id: true, slug: true },
  });
  for (const org of orgs) {
    await prisma.printJob.deleteMany({ where: { printer: { organizationId: org.id } } });
    await seeder.wipeTestOrg(org.id);
    await prisma.printer.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    console.log(`removed ${org.slug}`);
  }
  console.log(`done: removed ${orgs.length} orgs`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
