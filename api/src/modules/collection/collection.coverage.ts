import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * How many of an organization's active customers have a usable phone number: a Nigerian mobile in
 * any stored format, or an international number. Stored numbers are free text, so this compares
 * digits only. (Backslashes are avoided on purpose: a tagged template cooks "\s" into "s".)
 */
export async function customerCoverage(db: Db, organizationId: string) {
  const [row] = await db.$queryRaw<{ total: bigint; with_phone: bigint }[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') ~ '^(234|0)?(70|80|81|90|91)[0-9]{8}$'
           OR (phone ~ '^[[:space:]]*[+]' AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 8 AND 15)
      ) AS with_phone
    FROM customers
    WHERE organization_id = ${organizationId} AND is_active = true
  `;
  const total = Number(row?.total ?? 0);
  const withPhone = Number(row?.with_phone ?? 0);
  return { customers: total, withPhone, pct: total ? Math.round((withPhone / total) * 1000) / 10 : 0 };
}
