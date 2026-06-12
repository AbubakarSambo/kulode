import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
      create: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
  role: 'SUPER_ADMIN',
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
    expect(result.user.role).toBe(mockUser.role);
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
        role: mockUser.role,
      }),
    );
  });
});
