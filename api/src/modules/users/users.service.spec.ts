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
  role: Role.STAFF,
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
    role: 'STAFF',
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
    await expect(service.create(ORG_ID, createDto)).rejects.toThrow(ConflictException);
  });

  // ─── Grandfathered ───────────────────────────────────────────────────────

  it('does not enforce user limits for grandfathered orgs', async () => {
    prisma.user.findUnique.mockResolvedValue(null); // email not in use
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE', isGrandfathered: true }));
    setupTransactionMock(prisma);

    await service.create(ORG_ID, createDto);

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  // ─── FREE plan limits ────────────────────────────────────────────────────

  it('allows user creation when FREE plan has 0 active users (limit is 1)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.user.count.mockResolvedValue(0); // 0 active users
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto)).resolves.toBeDefined();
  });

  it('throws USER_LIMIT_REACHED when FREE plan already has 1 active user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'FREE' }));
    prisma.user.count.mockResolvedValue(1); // already at limit

    await expect(service.create(ORG_ID, createDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'FREE',
        limit: 1,
        current: 1,
      }),
    });
  });

  // ─── PRO plan limits ─────────────────────────────────────────────────────

  it('allows user creation when ACTIVE PRO plan has 2 active users (limit is 3)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' }));
    prisma.user.count.mockResolvedValue(2);
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto)).resolves.toBeDefined();
  });

  it('throws USER_LIMIT_REACHED when ACTIVE PRO plan already has 3 active users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE' }));
    prisma.user.count.mockResolvedValue(3);

    await expect(service.create(ORG_ID, createDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_LIMIT_REACHED',
        currentPlan: 'PRO',
        limit: 3,
        current: 3,
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

    await expect(service.create(ORG_ID, createDto)).resolves.toBeDefined();
  });

  // ─── Trial scenarios ──────────────────────────────────────────────────────

  it('applies PRO user limits during an active trial (PRO plan, trial not expired)', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: futureDate }),
    );
    prisma.user.count.mockResolvedValue(2); // 2 of 3 used
    setupTransactionMock(prisma);

    await expect(service.create(ORG_ID, createDto)).resolves.toBeDefined();
  });

  it('drops to FREE user limit when PRO trial has expired (TRIALING + past end date)', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(
      orgWith({ planTier: 'PRO', subscriptionStatus: 'TRIALING', trialEndDate: pastDate }),
    );
    prisma.user.count.mockResolvedValue(2); // above FREE limit (1), below PRO limit (3)

    await expect(service.create(ORG_ID, createDto)).rejects.toMatchObject({
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

    await expect(service.create(ORG_ID, createDto)).rejects.toMatchObject({
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

    await expect(service.create(ORG_ID, createDto)).resolves.toBeDefined();
  });

  // ─── Invite email ────────────────────────────────────────────────────────

  it('sends a password setup email after successfully creating a user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ planTier: 'PRO', subscriptionStatus: 'ACTIVE', name: 'Acme' }));
    prisma.user.count.mockResolvedValue(1);
    setupTransactionMock(prisma);

    await service.create(ORG_ID, createDto);

    expect(emailService.sendPasswordSetupEmail).toHaveBeenCalledWith(
      createDto.email,
      createDto.firstName,
      expect.any(String), // token
      'Acme',
    );
  });

  // ─── remove (deactivation) ───────────────────────────────────────────────

  describe('remove', () => {
    it('throws ForbiddenException when user tries to deactivate themselves', async () => {
      await expect(service.remove(CURRENT_USER_ID, ORG_ID, CURRENT_USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('other-user-id', ORG_ID, CURRENT_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes by setting isActive to false', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user-id', organizationId: ORG_ID });
      prisma.user.update.mockResolvedValue({});

      const result = await service.remove('other-user-id', ORG_ID, CURRENT_USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
      expect(result).toMatchObject({ message: 'User deactivated successfully' });
    });
  });
});
