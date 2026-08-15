import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateUserDto, UpdateUserDto, SetPinDto } from './dto';
import { PaginationDto, paginate, PLAN_LIMITS, Role, PIN_ELIGIBLE_ROLES } from '../../common';
import { TokenType, OrgModule } from '@prisma/client';

const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];

// Which UserRole values are valid for an org, based on its enabled modules. Any org that runs
// the POS module (POS-only or BOTH) uses the WAITER/CASHIER/SUPERVISOR/MANAGER ladder for floor
// operations — STAFF/ACCOUNTANT are reserved for orgs that never touch POS (invoicing-only).
// A BOTH org's back-office/reporting access (Reports, AI Chat) is ADMIN+/SUPER_ADMIN-only as a
// result — there's no ACCOUNTANT-equivalent inside the POS ladder.
const POS_ROLES = [
  Role.WAITER,
  Role.PASS,
  Role.RUNNER,
  Role.CASHIER,
  Role.SUPERVISOR,
  Role.MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];
const NON_POS_ROLES = [Role.STAFF, Role.ACCOUNTANT, Role.ADMIN, Role.SUPER_ADMIN];

function usesPosRoles(enabledModules: OrgModule): boolean {
  return enabledModules === 'POS' || enabledModules === 'BOTH';
}

function assertRoleMatchesModule(role: string | undefined, enabledModules: OrgModule) {
  if (!role) return;
  const allowed = usesPosRoles(enabledModules) ? POS_ROLES : NON_POS_ROLES;
  if (!allowed.includes(role as Role)) {
    throw new ForbiddenException(
      `Role "${role}" isn't valid for a ${usesPosRoles(enabledModules) ? 'POS' : 'non-POS'} organization`,
    );
  }
}

// Only a SUPER_ADMIN may create, promote to, or otherwise touch an ADMIN/SUPER_ADMIN account.
function assertAdminActionAllowed(actingRole: string, targetOrRequestedRole: string | undefined) {
  if (actingRole === Role.SUPER_ADMIN) return;
  if (targetOrRequestedRole && ADMIN_ROLES.includes(targetOrRequestedRole as Role)) {
    throw new ForbiddenException('Only a Super Admin can create or manage Admin accounts');
  }
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findAll(organizationId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          businessRole: true,
          isActive: true,
          isEmailVerified: true,
          hasPlaceholderEmail: true,
          pinSetAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where: { organizationId } }),
    ]);

    return paginate(users, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        businessRole: true,
        isActive: true,
        isEmailVerified: true,
        hasPlaceholderEmail: true,
        pinSetAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(organizationId: string, dto: CreateUserDto, actingUserRole: string) {
    assertAdminActionAllowed(actingUserRole, dto.role);

    // Get org for invite email, plan check, role validation, and placeholder-email domain
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        slug: true,
        planTier: true,
        subscriptionStatus: true,
        trialEndDate: true,
        isGrandfathered: true,
        enabledModules: true,
      },
    });
    if (organization) {
      assertRoleMatchesModule(dto.role, organization.enabledModules);
    }

    const resolvedRole = dto.role || (organization && usesPosRoles(organization.enabledModules) ? 'WAITER' : 'STAFF');
    const isPinEligibleRole = PIN_ELIGIBLE_ROLES.includes(resolvedRole as Role);

    if (!dto.email && !isPinEligibleRole) {
      throw new ConflictException(`Email is required for role "${resolvedRole}"`);
    }

    let email: string;
    let hasPlaceholderEmail: boolean;
    if (dto.email) {
      email = dto.email.toLowerCase();
      hasPlaceholderEmail = false;

      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    } else {
      email = await this.generateUniquePlaceholderEmail(organization?.slug ?? organizationId, dto.firstName, dto.lastName);
      hasPlaceholderEmail = true;
    }

    // Enforce user limit unless grandfathered
    if (organization && !organization.isGrandfathered) {
      let effectivePlan = organization.planTier;
      if (
        organization.subscriptionStatus === 'TRIALING' &&
        organization.trialEndDate &&
        new Date() > organization.trialEndDate
      ) {
        effectivePlan = 'FREE';
      }
      if (organization.subscriptionStatus === 'EXPIRED') {
        effectivePlan = 'FREE';
      }

      const limits = PLAN_LIMITS[effectivePlan];
      const activeUserCount = await this.prisma.user.count({
        where: { organizationId, isActive: true },
      });

      if (activeUserCount >= limits.maxUsers) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'USER_LIMIT_REACHED',
          message: `Your ${effectivePlan} plan allows up to ${limits.maxUsers} user(s). Please upgrade to add more.`,
          currentPlan: effectivePlan,
          limit: limits.maxUsers,
          current: activeUserCount,
        });
      }
    }

    // Create user without password; only PIN-less (email-based) accounts get an invite token
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId,
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: resolvedRole,
          isEmailVerified: false,
          hasPlaceholderEmail,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          hasPlaceholderEmail: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (hasPlaceholderEmail) {
        return { user, token: null };
      }

      // Create password setup token (72h expiry)
      const token = crypto.randomBytes(32).toString('hex');
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token,
          type: TokenType.PASSWORD_SETUP,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      return { user, token };
    });

    // Send invite email (throws on failure so admin knows) — skipped for PIN-only accounts,
    // which have no real inbox and are set up via "Set PIN" instead.
    if (result.token) {
      await this.emailService.sendPasswordSetupEmail(
        email,
        dto.firstName,
        result.token,
        organization?.name || 'your organization',
      );
    }

    return result.user;
  }

  private async generateUniquePlaceholderEmail(orgSlug: string, firstName: string, lastName: string): Promise<string> {
    const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = crypto.randomBytes(3).toString('hex');
      const candidate = `${base}-${suffix}@${orgSlug}.internal`;
      const existing = await this.prisma.user.findUnique({ where: { email: candidate } });
      if (!existing) return candidate;
    }
    throw new ConflictException('Could not generate a unique internal account — please try again');
  }

  async resendInvite(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new ConflictException('User has already been verified');
    }

    if (user.hasPlaceholderEmail) {
      throw new ConflictException('This account has no real email — set a PIN instead');
    }

    // Invalidate old tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        type: TokenType.PASSWORD_SETUP,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create new token
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        type: TokenType.PASSWORD_SETUP,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    await this.emailService.sendPasswordSetupEmail(
      user.email,
      user.firstName,
      token,
      user.organization.name,
    );

    return { message: `Invitation resent to ${user.email}` };
  }

  async update(id: string, organizationId: string, dto: UpdateUserDto, currentUserId: string, actingUserRole: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent users from modifying their own role
    if (id === currentUserId && dto.role && dto.role !== user.role) {
      throw new ForbiddenException('Cannot modify your own role');
    }

    // Only a Super Admin may touch an Admin/Super Admin account or promote someone into one
    assertAdminActionAllowed(actingUserRole, user.role);
    assertAdminActionAllowed(actingUserRole, dto.role);

    if (dto.role) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { enabledModules: true },
      });
      if (organization) assertRoleMatchesModule(dto.role, organization.enabledModules);
    }

    // If email is being updated, check for conflicts
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateData: any = {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName && { lastName: dto.lastName }),
      ...(dto.email && { email: dto.email.toLowerCase() }),
      ...(dto.role && { role: dto.role }),
      ...(dto.businessRole !== undefined && { businessRole: dto.businessRole }),
      ...(typeof dto.isActive === 'boolean' && { isActive: dto.isActive }),
    };

    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        businessRole: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async setPin(id: string, organizationId: string, dto: SetPinDto) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    if (!PIN_ELIGIBLE_ROLES.includes(user.role as Role)) {
      throw new ForbiddenException(`A quick-login PIN can't be set for role "${user.role}"`);
    }

    // Uniqueness is enforced here (not a DB constraint, since the PIN is stored hashed) so two
    // staff in the same org can never end up with the same code and get mistaken for each other.
    const activeOrgUsers = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, pinHash: { not: null }, id: { not: id } },
      select: { pinHash: true },
    });
    for (const other of activeOrgUsers) {
      if (other.pinHash && (await bcrypt.compare(dto.pin, other.pinHash))) {
        throw new ConflictException('That PIN is already in use by another staff member — pick a different one');
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: { pinHash: await bcrypt.hash(dto.pin, 10), pinSetAt: new Date() },
    });

    return { message: 'PIN set' };
  }

  async clearPin(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({ where: { id }, data: { pinHash: null, pinSetAt: null } });
    return { message: 'PIN removed' };
  }

  async remove(id: string, organizationId: string, currentUserId: string, actingUserRole: string) {
    if (id === currentUserId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    assertAdminActionAllowed(actingUserRole, user.role);

    // Soft delete by deactivating
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'User deactivated successfully' };
  }
}
