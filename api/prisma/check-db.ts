import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Applying direct migrations...');
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paystack_token_generated_at" TIMESTAMP(3);
    `);
    console.log('Added paystack_token_generated_at to invoices');
  } catch (err) {
    console.error('Error modifying invoices:', err);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "payment_installments" ADD COLUMN IF NOT EXISTS "paystack_token_generated_at" TIMESTAMP(3);
    `);
    console.log('Added paystack_token_generated_at to payment_installments');
  } catch (err) {
    console.error('Error modifying payment_installments:', err);
  }

  // Backfill share tokens if missing
  try {
    const invoicesWithoutToken = await prisma.invoice.findMany({
      where: { shareToken: null },
    });
    console.log(`Found ${invoicesWithoutToken.length} invoices without share tokens`);
    const { randomBytes } = await import('crypto');
    for (const inv of invoicesWithoutToken) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { shareToken: randomBytes(16).toString('hex') },
      });
    }
    console.log('Backfilled share tokens');
  } catch (err) {
    console.error('Error backfilling share tokens:', err);
  }

  console.log('Done.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
