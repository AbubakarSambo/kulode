const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: 'sam18' }
  });
  if (!org) {
    console.log('sam18 org not found');
    return;
  }
  
  console.log('--- ORG INFO ---');
  console.log(org);
  
  const serviceItems = await prisma.serviceItem.findMany({
    where: { organizationId: org.id }
  });
  
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { organizationId: org.id }
  });

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: org.id },
    include: {
      items: true
    }
  });
  
  console.log('--- SERVICE ITEMS ---');
  console.log(JSON.stringify(serviceItems, null, 2));
  
  console.log('--- INVENTORY ITEMS ---');
  console.log(JSON.stringify(inventoryItems, null, 2));
  
  console.log('--- INVOICES ---');
  console.log(JSON.stringify(invoices, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

