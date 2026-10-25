import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

function createMockPrisma() {
  return {
    user: { findUnique: jest.fn() },
    userOrganization: { findUnique: jest.fn() },
  };
}

function createMockConfig() {
  return { get: jest.fn().mockReturnValue('test-secret') };
}

const baseUserRow = {
  id: 'user-1',
  email: 'admin@acme.com',
  organizationId: 'org-1',
  roles: ['SUPER_ADMIN'],
  firstName: 'John',
  lastName: 'Doe',
  isPlatformAdmin: false,
  isActive: true,
};

describe('JwtStrategy — multi-org validate()', () => {
  let strategy: JwtStrategy;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    strategy = new JwtStrategy(createMockConfig() as unknown as ConfigService, prisma as unknown as PrismaService);
  });

  it('resolves against the user row directly when the token org matches the default org (no extra query)', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUserRow);

    const result = await strategy.validate({ sub: 'user-1', email: baseUserRow.email, organizationId: 'org-1', roles: baseUserRow.roles });

    expect(result).toMatchObject({ organizationId: 'org-1', roles: ['SUPER_ADMIN'] });
    expect(prisma.userOrganization.findUnique).not.toHaveBeenCalled();
  });

  it('resolves roles from the membership table when the token org differs from the default org', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUserRow);
    prisma.userOrganization.findUnique.mockResolvedValue({ roles: ['MANAGER'] });

    const result = await strategy.validate({ sub: 'user-1', email: baseUserRow.email, organizationId: 'org-2', roles: ['SUPER_ADMIN'] });

    expect(result).toMatchObject({ organizationId: 'org-2', roles: ['MANAGER'] });
    expect(prisma.userOrganization.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'user-1', organizationId: 'org-2' } },
      select: { roles: true },
    });
  });

  it('rejects a switched-org claim whose membership has been revoked, even though the JWT itself is still validly signed', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUserRow);
    prisma.userOrganization.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'user-1', email: baseUserRow.email, organizationId: 'org-2', roles: ['SUPER_ADMIN'] }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an inactive user regardless of org claim', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUserRow, isActive: false });

    await expect(
      strategy.validate({ sub: 'user-1', email: baseUserRow.email, organizationId: 'org-1', roles: baseUserRow.roles }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

function makeStrategy(prisma: any) {
  const config = { get: jest.fn().mockReturnValue('test-secret') } as any;
  return new JwtStrategy(config, prisma);
}

describe('JwtStrategy — "View as" tokens', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const admin = {
    id: 'admin-1',
    email: 'ops@tari1.com',
    firstName: 'Ops',
    lastName: 'Admin',
    isPlatformAdmin: true,
    isActive: true,
  };
  const session = { id: 'sess-1', organizationId: 'org-target', expiresAt: future, endedAt: null, platformAdmin: admin };
  const payload = { sub: 'admin-1', email: admin.email, organizationId: 'org-target', roles: ['SUPER_ADMIN'], imp: 'sess-1' };

  function prismaWith(row: any) {
    return {
      impersonationSession: { findUnique: jest.fn().mockResolvedValue(row) },
      user: { findUnique: jest.fn() },
      userOrganization: { findUnique: jest.fn() },
    };
  }

  it('resolves to the target org as SUPER_ADMIN with platform-admin bypasses switched off', async () => {
    const prisma = prismaWith(session);
    const user = await makeStrategy(prisma).validate(payload);
    expect(user).toEqual({
      id: 'admin-1',
      email: admin.email,
      organizationId: 'org-target',
      roles: ['SUPER_ADMIN'],
      firstName: 'Ops',
      lastName: 'Admin',
      isPlatformAdmin: false,
      impersonationSessionId: 'sess-1',
    });
    // Never falls through to the membership lookup — no UserOrganization row is needed.
    expect(prisma.userOrganization.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['the session has ended', { ...session, endedAt: new Date() }],
    ['the session has expired', { ...session, expiresAt: new Date(Date.now() - 1000) }],
    ['the session is for another org', { ...session, organizationId: 'org-other' }],
    ['the admin lost platform-admin status', { ...session, platformAdmin: { ...admin, isPlatformAdmin: false } }],
    ['the admin was deactivated', { ...session, platformAdmin: { ...admin, isActive: false } }],
    ['the token was issued to someone else', { ...session, platformAdmin: { ...admin, id: 'admin-2' } }],
    ['the session does not exist', null],
  ])('rejects the token when %s', async (_label, row) => {
    await expect(makeStrategy(prismaWith(row)).validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
