const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tokens = await prisma.emailVerificationToken.findMany({
    include: {
      user: {
        select: {
          email: true,
          isEmailVerified: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  console.log(JSON.stringify(tokens, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
