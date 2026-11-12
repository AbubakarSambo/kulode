import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer, PhoneCreditSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalisePhone, phoneDigitVariants, PHONE_REJECTION_MESSAGES, runIdempotent } from '../../common';

type Db = PrismaService | Prisma.TransactionClient;

export interface CaptureContext {
  organizationId: string;
  /** Who is actually typing. */
  actorId: string;
  /** Who earns the credit — the actor, or the "Collected by" person for paper/QR forms. */
  creditUserId?: string;
  source: PhoneCreditSource;
  orderId?: string;
  capturedAt?: Date;
  clientRequestId?: string;
}

// Offline captures keep their original time, but not an arbitrary one: a device clock that is
// days off could otherwise move credits into (or out of) a collection period.
const MAX_CAPTURE_AGE_MS = 14 * 86_400_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Everything about saving a customer's phone number: normalise + validate, refuse a number that
 * already belongs to someone else, and give the staff member ONE credit when a customer who had no
 * number gets one. Editing an existing number never earns a credit.
 */
@Injectable()
export class PhoneCaptureService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validates a typed number against the org's country and blocklist. Throws 400 with a reason. */
  async normaliseForOrg(organizationId: string, raw: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneCountry: true, phoneBlocklist: true },
    });
    const result = normalisePhone(raw, org?.phoneCountry ?? 'NG', org?.phoneBlocklist ?? []);
    if (!result.ok) {
      throw new BadRequestException({
        message: PHONE_REJECTION_MESSAGES[result.reason],
        code: 'PHONE_INVALID',
        reason: result.reason,
      });
    }
    return result.e164;
  }

  /**
   * The customer that already holds this number, whatever format it was saved in ("0803…",
   * "+234 803…", "234803…"). Compares digits only, against the expression index on customers.
   */
  async findHolder(db: Db, organizationId: string, e164: string, excludeId?: string): Promise<{ id: string; name: string } | null> {
    const variants = phoneDigitVariants(e164);
    const rows = await db.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM customers
      WHERE organization_id = ${organizationId}
        AND phone IS NOT NULL
        AND regexp_replace(phone, '[^0-9]', '', 'g') = ANY(${variants}::text[])
        ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private exists(holder: { id: string; name: string }): never {
    throw new ConflictException({
      message: 'Customer already exists',
      code: 'PHONE_EXISTS',
      existingCustomerId: holder.id,
      existingCustomerName: holder.name,
    });
  }

  private checkCapturedAt(capturedAt?: Date): Date {
    const now = Date.now();
    if (!capturedAt) return new Date(now);
    const t = capturedAt.getTime();
    if (Number.isNaN(t) || t > now + MAX_CLOCK_SKEW_MS || t < now - MAX_CAPTURE_AGE_MS) {
      throw new BadRequestException('capturedAt is outside the allowed window');
    }
    return capturedAt;
  }

  private async recordCredit(tx: Prisma.TransactionClient, ctx: CaptureContext, customerId: string, phone: string): Promise<boolean> {
    // skipDuplicates (not create + catch): a unique violation inside a transaction poisons it. The
    // unique customerId means a customer can only ever earn one credit.
    const res = await tx.phoneCredit.createMany({
      data: [
        {
          organizationId: ctx.organizationId,
          userId: ctx.creditUserId ?? ctx.actorId,
          enteredById: ctx.actorId,
          customerId,
          phone,
          source: ctx.source,
          orderId: ctx.orderId,
          capturedAt: this.checkCapturedAt(ctx.capturedAt),
          clientRequestId: ctx.clientRequestId,
        },
      ],
      skipDuplicates: true,
    });
    return res.count === 1;
  }

  /** A new customer, with or without a number. A number earns the creator a credit. */
  async createCustomer(
    ctx: CaptureContext,
    dto: { name: string; phone?: string; email?: string; notes?: string },
  ): Promise<Customer & { credited: boolean }> {
    const phone = dto.phone?.trim() ? await this.normaliseForOrg(ctx.organizationId, dto.phone) : null;
    const run = async (tx: Prisma.TransactionClient) => {
      // Inside the transaction (after the idempotency key is claimed): a retried request whose
      // first attempt already saved this number must replay that result, not hit "already exists".
      const holder = phone ? await this.findHolder(tx, ctx.organizationId, phone) : null;
      if (holder) this.exists(holder);
      const customer = await tx.customer.create({
        data: { organizationId: ctx.organizationId, name: dto.name, phone, email: dto.email, notes: dto.notes, createdById: ctx.actorId },
      });
      const credited = phone ? await this.recordCredit(tx, ctx, customer.id, phone) : false;
      return { ...customer, credited };
    };
    try {
      return ctx.clientRequestId
        ? await runIdempotent(this.prisma, ctx.organizationId, 'CUSTOMER_CREATE', ctx.clientRequestId, run)
        : await this.prisma.$transaction(run);
    } catch (error) {
      // Lost a race with another save of the same number between findHolder and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const holder = phone && (await this.findHolder(this.prisma, ctx.organizationId, phone));
        if (holder) this.exists(holder);
        throw new ConflictException('A customer with this phone number already exists');
      }
      throw error;
    }
  }

  /**
   * Change a customer's number. Credits the staff member only when the customer had no (valid)
   * number before; correcting an existing number does not.
   */
  async setPhone(ctx: CaptureContext, customerId: string, rawPhone: string | null): Promise<{ phone: string | null; credited: boolean }> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: ctx.organizationId },
      select: { id: true, phone: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (rawPhone === null || !rawPhone.trim()) {
      // Clearing a number is allowed, but the one-credit-per-customer rule still stands.
      await this.prisma.customer.update({ where: { id: customerId }, data: { phone: null } });
      return { phone: null, credited: false };
    }

    const phone = await this.normaliseForOrg(ctx.organizationId, rawPhone);
    const holder = await this.findHolder(this.prisma, ctx.organizationId, phone, customerId);
    if (holder) this.exists(holder);

    const org = await this.prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { phoneCountry: true } });
    const hadValidNumber = !!customer.phone && normalisePhone(customer.phone, org?.phoneCountry ?? 'NG').ok;

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { phone } });
      const credited = hadValidNumber ? false : await this.recordCredit(tx, ctx, customerId, phone);
      return { phone, credited };
    });
  }

  /** Paper / QR-feedback-form numbers keyed in by a supervisor on behalf of the staff member who collected them. */
  async quickAdd(
    ctx: CaptureContext,
    dto: { name: string; phone: string; email?: string; collectedById: string },
  ): Promise<Customer & { credited: boolean }> {
    const collector = await this.prisma.user.findFirst({
      where: { id: dto.collectedById, organizationId: ctx.organizationId, isActive: true },
      select: { id: true },
    });
    if (!collector) throw new BadRequestException('Collected by must be an active staff member of this organization');
    return this.createCustomer({ ...ctx, creditUserId: collector.id, source: PhoneCreditSource.QUICK_ADD }, dto);
  }
}
