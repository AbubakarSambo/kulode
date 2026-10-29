import * as bcrypt from 'bcrypt';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Role } from '../../common';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createMockEmail() {
  return {
    sendPasswordSetupEmail: jest.fn().mockResolvedValue(undefined),
  };
}

const ORG_ID = 'org-abc-123';
const CURRENT_USER_ID = 'user-admin-123';

const createDto = {
  email: 'newuser@example.com',
  firstName: 'New',
  lastName: 'User',
  roles: [Role.STAFF],
};

function orgWith(overrides: object) {
  return {
    name: 'Test Org',
    planTier: 'FREE',
    subscriptionStatus: 'ACTIVE',
    trialEndDate: null,
    isGrandfathered: false,
    ...overrides,
  };
}

// Mocks the $transaction to call the callback with the prisma mock
function setupTransactionMock(prisma: ReturnType<typeof createMockPrisma>) {
  const createdUser = {
    id: 'new-user-id',
    email: createDto.email,
    firstName: createDto.firstName,
    lastName: createDto.lastName,
    roles: ['STAFF'],
    isActive: true,
    isEmailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    const txMock = {
      user: { create: jest.fn().mockResolvedValue(createdUser) },
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
    };
    return callback(txMock);
  });

  return createdUser;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsersService — user limit enforcement', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let emailService: ReturnType<typeof createMockEmail>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    emailService = createMockEmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── Conflict guard ──────────────────────────────────────────────────────

  it('throws ConflictException when email is already in use', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });
    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).rejects.toThrow(ConflictException);
  });

  // ─── Grandfathered ───────────────────────────────────────────────────────

  it('does not enforce user limits for grandfathered orgs', async () => {
    prisma.user.findUnique.mockResolvedValue(null); // email not in use
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE', isGrandfathered: true }));
    setupTransactionMock(prisma);

    await service.create(ORG_ID, createDto, [Role.SUPER_ADMIN]);

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  // ─── FREE plan limits ────────────────────────────────────────────────────

  it('allows user creation when FREE plan has 0 active users (limit is 1)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.user.count.mockResolvedValue(0); // 0 active users
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).resolves.toBeDefined();
  });

  it('throws USER_LIMIT_REACHED when FREE plan already has 1 active user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.user.count.mockResolvedValue(1); // already at limit

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 1,
        current: 1,
      }),
    });
  });

  // ─── PRO plan limits ─────────────────────────────────────────────────────

  it('allows user creation when ACTIVE PRO plan has 9 active users (limit is 10)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' }));
    prisma.user.count.mockResolvedValue(9);
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).resolves.toBeDefined();
  });

  it('throws USER_LIMIT_REACHED when ACTIVE PRO plan already has 10 active users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' }));
    prisma.user.count.mockResolvedValue(10);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'PRO',
        limit: 10,
        current: 10,
      }),
    });
  });

  // ─── BUSINESS plan limits ─────────────────────────────────────────────────

  it('never enforces user limits for ACTIVE BUSINESS plan (unlimited)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'BUSINESS', subscriptionStatus: 'ACTIVE' }),
    );
    prisma.user.count.mockResolvedValue(999);
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).resolves.toBeDefined();
  });

  // ─── Trial scenarios ──────────────────────────────────────────────────────

  it('has no user limit during an active PRO trial, even past the PRO cap of 10', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: futureDate }),
    );
    prisma.user.count.mockResolvedValue(25);
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).resolves.toBeDefined();
  });

  it('drops to FREE user limit when PRO trial has expired (TRIALING + past end date)', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: pastDate }),
    );
    prisma.user.count.mockResolvedValue(2); // above FREE limit (1), below PRO limit (10)

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 1,
      }),
    });
  });

  it('applies FREE user limits when subscription status is EXPIRED', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'EXPIRED' }),
    );
    prisma.user.count.mockResolvedValue(2);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 1,
      }),
    });
  });

  it('allows user creation when expired BUSINESS org is under FREE limit', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'BUSINESS', subscriptionStatus: 'EXPIRED' }),
    );
    prisma.user.count.mockResolvedValue(0);
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto, [Role.SUPER_ADMIN])).resolves.toBeDefined();
  });

  // ─── Invite email ────────────────────────────────────────────────────────

  it('sends a password setup email after successfully creating a user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE', name: 'Acme' }));
    prisma.user.count.mockResolvedValue(1);
    setupTransactionMock(prisma);

    await service.create(ORG_ID, createDto, [Role.SUPER_ADMIN]);

    expect(emailService.sendPasswordSetupEmail).toHaveBeenCalledWith(
      createDto.email,
      createDto.firstName,
      expect.any(String), // token
      'Acme',
    );
  });

  // ─── remove (deactivation) ───────────────────────────────────────────────

  describe('findAll', () => {
    it("lists this org's accounts plus members from other orgs, with the member's roles here", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'own', organizationId: ORG_ID, roles: [Role.CASHIER], organizationMemberships: [] },
        { id: 'owner', organizationId: 'other-org', roles: [Role.WAITER], organizationMemberships: [{ roles: [Role.SUPER_ADMIN] }] },
      ]);
      prisma.user.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(prisma.user.findMany.mock.lastCall[0].where).toEqual({
        OR: [{ organizationId: ORG_ID }, { organizationMemberships: { some: { organizationId: ORG_ID } } }],
      });
      expect(result.data).toEqual([
        { id: 'own', roles: [Role.CASHIER], isMember: false },
        { id: 'owner', roles: [Role.SUPER_ADMIN], isMember: true },
      ]);
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException when user tries to deactivate themselves', async () => {
      await expect(service.remove(CURRENT_USER_ID, ORG_ID, CURRENT_USER_ID, [Role.SUPER_ADMIN])).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('other-user-id', ORG_ID, CURRENT_USER_ID, [Role.SUPER_ADMIN])).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes by setting isActive to false', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user-id', organizationId: ORG_ID });
      prisma.user.update.mockResolvedValue({});

      const result = await service.remove('other-user-id', ORG_ID, CURRENT_USER_ID, [Role.SUPER_ADMIN]);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(result).toMatchObject({ message: 'User deactivated successfully' });
    });

    it('throws ForbiddenException when an ADMIN tries to deactivate another ADMIN', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-admin-id', organizationId: ORG_ID, roles: [Role.ADMIN] });
      await expect(service.remove('other-admin-id', ORG_ID, CURRENT_USER_ID, [Role.ADMIN])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a SUPER_ADMIN to deactivate an ADMIN', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-admin-id', organizationId: ORG_ID, roles: [Role.ADMIN] });
      prisma.user.update.mockResolvedValue({});
      await expect(
        service.remove('other-admin-id', ORG_ID, CURRENT_USER_ID, [Role.SUPER_ADMIN]),
      ).resolves.toMatchObject({ message: 'User deactivated successfully' });
    });
  });

  // ─── Admin-can't-touch-admin (create/update) ────────────────────────────────

  describe('admin-cannot-manage-admin restriction', () => {
    it('throws ForbiddenException when an ADMIN tries to create another ADMIN', async () => {
      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.ADMIN] }, [Role.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when an ADMIN tries to create a SUPER_ADMIN', async () => {
      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.SUPER_ADMIN] }, [Role.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a SUPER_ADMIN to create an ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({}));
      prisma.user.count.mockResolvedValue(0);
      setupTransactionMock(prisma);

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.ADMIN] }, [Role.SUPER_ADMIN]),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when an ADMIN tries to update another ADMIN (even a non-role field)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-admin-id', roles: [Role.ADMIN], email: 'a@b.com' });
      await expect(
        service.update('other-admin-id', ORG_ID, { firstName: 'New' }, CURRENT_USER_ID, [Role.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when an ADMIN tries to promote a STAFF user to ADMIN', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'staff-id', roles: [Role.STAFF], email: 'a@b.com' });
      await expect(
        service.update('staff-id', ORG_ID, { roles: [Role.ADMIN] }, CURRENT_USER_ID, [Role.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Manager may manage floor staff only ────────────────────────────────────

  describe('manager scope', () => {
    it.each([[Role.MANAGER], [Role.ADMIN], [Role.SUPER_ADMIN], [Role.STAFF]])(
      'refuses a MANAGER creating a %s account',
      async (role) => {
        await expect(service.create(ORG_ID, { ...createDto, roles: [role] }, [Role.MANAGER])).rejects.toThrow(
          ForbiddenException,
        );
      },
    );

    it('refuses a MANAGER editing another manager, even a non-role field', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'm2', roles: [Role.MANAGER], email: 'm@b.com' });
      await expect(
        service.update('m2', ORG_ID, { firstName: 'New' }, CURRENT_USER_ID, [Role.MANAGER]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a MANAGER promoting a waiter to manager', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'w1', roles: [Role.WAITER], email: 'w@b.com' });
      await expect(
        service.update('w1', ORG_ID, { roles: [Role.MANAGER] }, CURRENT_USER_ID, [Role.MANAGER]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a MANAGER deactivate a waiter but not an admin', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'w1', roles: [Role.WAITER] });
      prisma.user.update.mockResolvedValue({});
      await expect(service.remove('w1', ORG_ID, CURRENT_USER_ID, [Role.MANAGER])).resolves.toBeDefined();

      prisma.user.findFirst.mockResolvedValueOnce({ id: 'a1', roles: [Role.ADMIN] });
      await expect(service.remove('a1', ORG_ID, CURRENT_USER_ID, [Role.MANAGER])).rejects.toThrow(ForbiddenException);
    });

    it("refuses a MANAGER setting a PIN on an admin's account", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'a1', roles: [Role.ADMIN] });
      await expect(service.setPin('a1', ORG_ID, { pin: '1234' }, [Role.MANAGER])).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── PINs: sign-in PINs for floor roles, approval-only PINs for approvers ───

  describe('setPin', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.update.mockResolvedValue({});
    });

    it.each([[[Role.SUPERVISOR]], [[Role.MANAGER]], [[Role.ADMIN]]])('allows a PIN for %j', async (roles) => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles });
      await expect(service.setPin('u1', ORG_ID, { pin: '1234' }, [Role.SUPER_ADMIN])).resolves.toEqual({ message: 'PIN set' });
    });

    it('still refuses a PIN for an invoicing STAFF account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.STAFF] });
      await expect(service.setPin('u1', ORG_ID, { pin: '1234' }, [Role.SUPER_ADMIN])).rejects.toThrow(ForbiddenException);
    });

    it('keeps an approval PIN when a manager is re-roled to another approver role', async () => {
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: 'POS', posMode: 'RESTAURANT' });
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.MANAGER], email: 'm@b.com' });

      await service.update('u1', ORG_ID, { roles: [Role.SUPERVISOR] }, CURRENT_USER_ID, [Role.SUPER_ADMIN]);
      expect(prisma.user.update.mock.lastCall[0].data).not.toHaveProperty('pinHash');
    });
  });

  describe('setOwnPin', () => {
    let passwordHash: string;
    beforeAll(async () => {
      passwordHash = await bcrypt.hash('correct-horse', 4);
    });
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.update.mockResolvedValue({});
    });

    it('lets an Admin set their own approval PIN after re-confirming their password', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.WAITER, Role.ADMIN], passwordHash });
      await expect(service.setOwnPin('u1', ORG_ID, { pin: '1234', password: 'correct-horse' })).resolves.toEqual({
        message: 'PIN set',
      });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    });

    it('refuses a wrong password without touching the PIN', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.ADMIN], passwordHash });
      await expect(service.setOwnPin('u1', ORG_ID, { pin: '1234', password: 'nope' })).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sends PIN-only staff (no password) back to a manager', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.WAITER], passwordHash: null });
      await expect(service.setOwnPin('u1', ORG_ID, { pin: '1234', password: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('refuses a role that cannot hold a PIN', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', roles: [Role.STAFF], passwordHash });
      await expect(service.setOwnPin('u1', ORG_ID, { pin: '1234', password: 'correct-horse' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── Role must match the org's enabled module ───────────────────────────────

  describe('role-matches-org-module validation', () => {
    it('rejects assigning a POS-only role (WAITER) on an invoicing-only org', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'INVOICING' }));

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.WAITER] }, [Role.SUPER_ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects assigning a non-POS role (STAFF) on a POS-only org', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'POS' }));

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.STAFF] }, [Role.SUPER_ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigning WAITER on a POS-only org', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'POS' }));
      prisma.user.count.mockResolvedValue(0);
      setupTransactionMock(prisma);

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.WAITER] }, [Role.SUPER_ADMIN]),
      ).resolves.toBeDefined();
    });

    it('allows assigning PASS and RUNNER (kitchen roles) on a POS-only org', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'POS' }));
      prisma.user.count.mockResolvedValue(0);
      setupTransactionMock(prisma);

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.PASS] }, [Role.SUPER_ADMIN]),
      ).resolves.toBeDefined();
      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.RUNNER] }, [Role.SUPER_ADMIN]),
      ).resolves.toBeDefined();
    });

    it('allows assigning CASHIER on a BOTH-module org (POS ladder also applies there)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'BOTH' }));
      prisma.user.count.mockResolvedValue(0);
      setupTransactionMock(prisma);

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.CASHIER] }, [Role.SUPER_ADMIN]),
      ).resolves.toBeDefined();
    });

    it('rejects assigning ACCOUNTANT on a BOTH-module org (no accountant-equivalent in the POS ladder)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(orgWith({ enabledModules: 'BOTH' }));

      await expect(
        service.create(ORG_ID, { ...createDto, roles: [Role.ACCOUNTANT] }, [Role.SUPER_ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
