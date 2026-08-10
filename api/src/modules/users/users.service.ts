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
import { CreateUserDto, UpdateUserDto } from './dto';
import { PaginationDto, paginate, PLAN_LIMITS, Role } from '../../common';
import { TokenType, OrgModule } from '@prisma/client';

const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];

// Which UserRole values are valid for an org, based on its enabled modules. Any org that runs
// the POS module (POS-only or BOTH) uses the WAITER/CASHIER/SUPERVISOR/MANAGER ladder for floor
// operations — STAFF/ACCOUNTANT are reserved for orgs that never touch POS (invoicing-only).
// A BOTH org's back-office/reporting access (Reports, AI Chat) is ADMIN+/SUPER_ADMIN-only as a
// result — there's no ACCOUNTANT-equivalent inside the POS ladder.
const POS_ROLES = [Role.WAITER, Role.CASHIER, Role.SUPERVISOR, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN];
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

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Get org for invite email, plan check, and role validation
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
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

    // Create user without password and generate invite token
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId,
          email: dto.email.toLowerCase(),
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role || (organization && usesPosRoles(organization.enabledModules) ? 'WAITER' : 'STAFF'),
          isEmailVerified: false,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

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

    // Send invite email (throws on failure so admin knows)
    await this.emailService.sendPasswordSetupEmail(
      dto.email.toLowerCase(),
      dto.firstName,
      result.token,
      organization?.name || 'your organization',
    );

    return result.user;
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
