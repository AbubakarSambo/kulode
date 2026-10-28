import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    userOrganization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    impersonationSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    expenseCategory: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createMockEmail() {
  return {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendAddPasswordEmail: jest.fn().mockResolvedValue(undefined),
    sendMagicLinkEmail: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockJwt() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };
}

function createMockConfig() {
  return {
    get: jest.fn().mockReturnValue(5),
  };
}

const mockOrg = {
  id: 'org-1',
  name: 'Acme Ltd',
  slug: 'acme-ltd',
  planTier: 'PRO',
  subscriptionStatus: 'TRIALING',
  trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  isGrandfathered: false,
};

const mockUser = {
  id: 'user-1',
  email: 'admin@acme.com',
  firstName: 'John',
  lastName: 'Doe',
  roles: ['SUPER_ADMIN'],
  organizationId: 'org-1',
  isPlatformAdmin: false,
  isActive: true,
  isEmailVerified: true,
  passwordHash: '$2b$12$hashedpassword',
  googleId: null,
  organization: mockOrg,
};

// ─── login ─────────────────────────────────────────────────────────────────────

describe('AuthService — login', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let emailService: ReturnType<typeof createMockEmail>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    emailService = createMockEmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: createMockJwt() },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when user is not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'nobody@test.com', password: 'pass' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when account is deactivated', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
    await expect(service.login({ email: mockUser.email, password: 'pass' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when email is not verified', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isEmailVerified: false });
    await expect(service.login({ email: mockUser.email, password: 'pass' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException on wrong password', async () => {
    // Use a real bcrypt hash of 'correctpassword'
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('correctpassword', 12);
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
    await expect(service.login({ email: mockUser.email, password: 'wrongpassword' }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('returns accessToken and user payload on valid credentials', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('correctpassword', 12);
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

    const result = await service.login({ email: mockUser.email, password: 'correctpassword' });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.user.email).toBe(mockUser.email);
    expect(result.user.organizationId).toBe(mockUser.organizationId);
    expect(result.user.roles).toEqual(mockUser.roles);
    expect(result.user.plan.planTier).toBe(mockOrg.planTier);
  });

  it('normalises email to lowercase before querying', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await service.login({ email: 'ADMIN@ACME.COM', password: 'pass' }).catch(() => {});
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'admin@acme.com' } }),
    );
  });
});

// ─── register ──────────────────────────────────────────────────────────────────

describe('AuthService — register', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let emailService: ReturnType<typeof createMockEmail>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    emailService = createMockEmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: createMockJwt() },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('silently succeeds (honeypot) if _hp field is present', async () => {
    const result = await service.register({
      _hp: 'bot',
      email: 'bot@spam.com',
      password: 'pass',
      firstName: 'Bot',
      lastName: 'Bot',
      organizationName: 'Spam Co',
    } as any);
    expect(result.email).toBe('bot@spam.com');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws ConflictException when email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    await expect(service.register({
      email: mockUser.email,
      password: 'pass',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'Acme',
    } as any)).rejects.toThrow(ConflictException);
  });

  it('persists the registrant email as the organization contact email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null);
    const tx = {
      organization: { create: jest.fn().mockResolvedValue(mockOrg) },
      user: { create: jest.fn().mockResolvedValue(mockUser) },
      expenseCategory: { createMany: jest.fn().mockResolvedValue({ count: 7 }) },
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.register({
      email: 'Owner@NewBiz.com',
      password: 'pass',
      firstName: 'Ada',
      lastName: 'Obi',
      organizationName: 'New Biz Ltd',
    } as any);

    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Biz Ltd',
          email: 'owner@newbiz.com',
        }),
      }),
    );
  });

  it('defaults posMode to RESTAURANT when omitted', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null);
    const tx = {
      organization: { create: jest.fn().mockResolvedValue(mockOrg) },
      user: { create: jest.fn().mockResolvedValue(mockUser) },
      expenseCategory: { createMany: jest.fn().mockResolvedValue({ count: 7 }) },
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.register({
      email: 'owner@newbiz.com',
      password: 'pass',
      firstName: 'Ada',
      lastName: 'Obi',
      organizationName: 'New Biz Ltd',
    } as any);

    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ posMode: 'RESTAURANT' }) }),
    );
  });

  it('honors an explicit posMode (e.g. from a ?type=retail landing page)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null);
    const tx = {
      organization: { create: jest.fn().mockResolvedValue(mockOrg) },
      user: { create: jest.fn().mockResolvedValue(mockUser) },
      expenseCategory: { createMany: jest.fn().mockResolvedValue({ count: 7 }) },
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.register({
      email: 'owner@retailbiz.com',
      password: 'pass',
      firstName: 'Ada',
      lastName: 'Obi',
      organizationName: 'Retail Biz Ltd',
      posMode: 'RETAIL',
    } as any);

    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ posMode: 'RETAIL' }) }),
    );
  });

  it('throws ConflictException when organization slug already exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null); // no email conflict
    prisma.organization.findUnique.mockResolvedValue(mockOrg); // slug conflict
    await expect(service.register({
      email: 'new@test.com',
      password: 'pass',
      firstName: 'Jane',
      lastName: 'Smith',
      organizationName: 'Acme Ltd',
    } as any)).rejects.toThrow(ConflictException);
  });
});

// ─── generateToken payload ──────────────────────────────────────────────────────

describe('AuthService — JWT payload shape', () => {
  it('includes sub, email, organizationId, and role in the token payload', async () => {
    const jwtService = { sign: jest.fn().mockReturnValue('token') };
    const prisma = createMockPrisma();
    const emailService = createMockEmail();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    const service = module.get<AuthService>(AuthService);

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('pass', 12);
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

    await service.login({ email: mockUser.email, password: 'pass' });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: mockUser.id,
        email: mockUser.email,
        organizationId: mockUser.organizationId,
        roles: mockUser.roles,
      }),
    );
  });
});

// ─── switchOrganization / getMyOrganizations ────────────────────────────────────

describe('AuthService — switchOrganization', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: createMockJwt() },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: createMockEmail() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when the user has no membership in the target org', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.userOrganization.findUnique.mockResolvedValue(null);

    await expect(service.switchOrganization('user-1', 'org-2')).rejects.toThrow(UnauthorizedException);
    expect(prisma.organization.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('switches back to the default org from the User row, with no membership row needed', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await service.switchOrganization('user-1', 'org-1');

    expect(prisma.userOrganization.findUnique).not.toHaveBeenCalled();
    expect(result.user.organizationId).toBe('org-1');
    expect(result.user.roles).toEqual(['SUPER_ADMIN']);
  });

  it('mints a token scoped to the target org and its membership roles on success', async () => {
    const membership = { userId: 'user-1', organizationId: 'org-2', roles: ['MANAGER'], isDefault: false };
    const targetOrg = { ...mockOrg, id: 'org-2', name: 'Second Branch' };

    prisma.userOrganization.findUnique.mockResolvedValue(membership);
    prisma.user.findUnique.mockResolvedValue(mockUser);
    prisma.organization.findUniqueOrThrow.mockResolvedValue(targetOrg);

    const jwtService = { sign: jest.fn().mockReturnValue('switched-token') };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: createMockEmail() },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);

    const result = await service.switchOrganization('user-1', 'org-2');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', organizationId: 'org-2', roles: ['MANAGER'] }),
    );
    expect(result.accessToken).toBe('switched-token');
    expect(result.user.organizationId).toBe('org-2');
    expect(result.user.organizationName).toBe('Second Branch');
    expect(result.user.roles).toEqual(['MANAGER']);
  });

  it('getMyOrganizations always lists the default org first, from the User row', async () => {
    // No membership row for org-1 — users created after the 2026-10-09 backfill never got one
    prisma.user.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      roles: ['SUPER_ADMIN'],
      organization: { id: 'org-1', name: 'Acme Ltd', slug: 'acme-ltd' },
    });
    prisma.userOrganization.findMany.mockResolvedValue([
      {
        organizationId: 'org-2',
        roles: ['MANAGER'],
        organization: { id: 'org-2', name: 'Second Branch', slug: 'second-branch' },
      },
    ]);

    const result = await service.getMyOrganizations('user-1');

    expect(prisma.userOrganization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', organizationId: { not: 'org-1' } } }),
    );
    expect(result).toEqual([
      { organizationId: 'org-1', organizationName: 'Acme Ltd', organizationSlug: 'acme-ltd', roles: ['SUPER_ADMIN'], isDefault: true },
      { organizationId: 'org-2', organizationName: 'Second Branch', organizationSlug: 'second-branch', roles: ['MANAGER'], isDefault: false },
    ]);
  });
});

// ─── creating another organization under the same login ─────────────────────────

describe('AuthService — createAdditionalOrganization', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  const newOrg = { ...mockOrg, id: 'org-new', name: 'NOON Daytime Bar', slug: 'noon-daytime-bar', planTier: 'FREE', subscriptionStatus: 'EXPIRED' };

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: createMockJwt() },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: createMockEmail() },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.organization.findUnique.mockResolvedValue(null); // slug is free
    prisma.organization.create.mockResolvedValue(newOrg);
    prisma.organization.findUniqueOrThrow.mockResolvedValue(newOrg);
    prisma.userOrganization.findUnique.mockResolvedValue({ userId: 'user-1', organizationId: 'org-new', roles: ['SUPER_ADMIN'] });
  });

  it('creates the org with no trial, makes the caller its Super Admin, and switches into it', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await service.createAdditionalOrganization({ id: 'user-1' }, { organizationName: ' NOON Daytime Bar ' });

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'NOON Daytime Bar',
        email: 'admin@acme.com',
        planTier: 'FREE',
        subscriptionStatus: 'EXPIRED',
        posMode: 'RESTAURANT',
      }),
    });
    expect(prisma.organization.create.mock.calls[0][0].data).not.toHaveProperty('trialEndDate');
    expect(prisma.expenseCategory.createMany).toHaveBeenCalled();
    expect(prisma.userOrganization.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', organizationId: 'org-new', roles: ['SUPER_ADMIN'], isDefault: false },
    });
    expect(result.user.organizationId).toBe('org-new');
    expect(result.user.roles).toEqual(['SUPER_ADMIN']);
  });

  it('refuses an unverified email', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isEmailVerified: false });
    await expect(
      service.createAdditionalOrganization({ id: 'user-1' }, { organizationName: 'X' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it('refuses a "View as" session', async () => {
    await expect(
      service.createAdditionalOrganization({ id: 'user-1', impersonationSessionId: 's1' }, { organizationName: 'X' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ─── impersonation ("View as") ──────────────────────────────────────────────────

describe('AuthService — impersonation', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let jwt: ReturnType<typeof createMockJwt>;

  const platformAdmin = { ...mockUser, id: 'admin-1', email: 'ops@tari1.com', isPlatformAdmin: true };
  const targetOrg = { ...mockOrg, id: 'org-target', name: 'The Courtyard' };

  beforeEach(async () => {
    prisma = createMockPrisma();
    jwt = createMockJwt();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: createMockConfig() },
        { provide: EmailService, useValue: createMockEmail() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('refuses a non-platform-admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...platformAdmin, isPlatformAdmin: false });
    await expect(service.startImpersonation('admin-1', 'org-target', {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.impersonationSession.create).not.toHaveBeenCalled();
  });

  it('404s an unknown organization', async () => {
    prisma.user.findUnique.mockResolvedValue(platformAdmin);
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.startImpersonation('admin-1', 'missing', {})).rejects.toThrow(NotFoundException);
  });

  it('records a session and returns a SUPER_ADMIN, non-platform-admin view of the target org', async () => {
    prisma.user.findUnique.mockResolvedValue(platformAdmin);
    prisma.organization.findUnique.mockResolvedValue(targetOrg);
    prisma.impersonationSession.create.mockResolvedValue({ id: 'sess-1' });

    const result = await service.startImpersonation('admin-1', 'org-target', {
      reason: 'Support ticket #12',
      ipAddress: '1.2.3.4',
    });

    expect(prisma.impersonationSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platformAdminId: 'admin-1',
        organizationId: 'org-target',
        reason: 'Support ticket #12',
        ipAddress: '1.2.3.4',
      }),
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'admin-1', organizationId: 'org-target', roles: ['SUPER_ADMIN'], imp: 'sess-1' }),
      { expiresIn: 3600 },
    );
    expect(result.user).toMatchObject({
      organizationId: 'org-target',
      organizationName: 'The Courtyard',
      roles: ['SUPER_ADMIN'],
      isPlatformAdmin: false,
      impersonation: { sessionId: 'sess-1', readOnly: true },
    });
  });

  it('ends only a still-open session', async () => {
    prisma.impersonationSession.updateMany.mockResolvedValue({ count: 1 });
    await service.endImpersonation('sess-1');
    expect(prisma.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'sess-1', endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
  });
});
