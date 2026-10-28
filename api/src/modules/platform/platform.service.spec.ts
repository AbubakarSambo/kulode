import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn((args) => args),
    },
    organization: {
      findUnique: jest.fn(),
    },
    userOrganization: {
      upsert: jest.fn(),
      updateMany: jest.fn((args) => args),
    },
    $transaction: jest.fn(),
  };
}

describe('PlatformService — multi-org admin', () => {
  let service: PlatformService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlatformService);
  });

  describe('findUserByEmail', () => {
    it('lists the primary org first with the User row\'s roles, even with no membership row for it', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@acme.com',
        organizationId: 'org-1',
        roles: ['SUPERVISOR'],
        organization: { id: 'org-1', name: 'Acme', slug: 'acme' },
        organizationMemberships: [
          { organizationId: 'org-2', roles: ['MANAGER'], isDefault: false, organization: { id: 'org-2', name: 'Branch', slug: 'branch' } },
        ],
      });

      const result = await service.findUserByEmail('admin@acme.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@acme.com' } }),
      );
      expect(result.organizationMemberships.map((m) => [m.organizationId, m.roles, m.isDefault])).toEqual([
        ['org-1', ['SUPERVISOR'], true],
        ['org-2', ['MANAGER'], false],
      ]);
    });

    it('throws NotFoundException when no user matches the email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findUserByEmail('nobody@acme.com')).rejects.toThrow(NotFoundException);
    });
  });

  describe('grantOrganizationAccess', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.grantOrganizationAccess('missing-user', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userOrganization.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the organization does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['ADMIN'] });
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.grantOrganizationAccess('user-1', 'missing-org')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userOrganization.upsert).not.toHaveBeenCalled();
    });

    it('creates a non-default membership defaulting to the user\'s current roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['ADMIN'] });
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-2', name: 'Second Org' });
      prisma.userOrganization.upsert.mockResolvedValue({
        organizationId: 'org-2',
        roles: ['ADMIN'],
        isDefault: false,
      });

      const result = await service.grantOrganizationAccess('user-1', 'org-2');

      expect(prisma.userOrganization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_organizationId: { userId: 'user-1', organizationId: 'org-2' } },
          create: expect.objectContaining({ roles: ['ADMIN'], isDefault: false }),
        }),
      );
      expect(result.organizationName).toBe('Second Org');
    });

    it('uses explicit roles when provided instead of the user\'s current roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['ADMIN'] });
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-2', name: 'Second Org' });
      prisma.userOrganization.upsert.mockResolvedValue({
        organizationId: 'org-2',
        roles: ['MANAGER'],
        isDefault: false,
      });

      await service.grantOrganizationAccess('user-1', 'org-2', ['MANAGER']);

      expect(prisma.userOrganization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ roles: ['MANAGER'] }),
          update: { roles: ['MANAGER'] },
        }),
      );
    });
  });

  describe('updateMembershipRoles', () => {
    beforeEach(() => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
      prisma.$transaction.mockResolvedValue([]);
    });

    it('updates the User row (and its membership row) for the primary org, clearing a PIN the roles cannot hold', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', roles: ['SUPERVISOR'] });

      const result = await service.updateMembershipRoles('user-1', 'org-1', ['STAFF']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { roles: ['STAFF'], pinHash: null, pinSetAt: null },
      });
      expect(prisma.userOrganization.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', organizationId: 'org-1' },
        data: { roles: ['STAFF'] },
      });
      expect(result).toEqual({ organizationId: 'org-1', organizationName: 'Acme', roles: ['STAFF'], isDefault: true });
    });

    it('keeps the PIN when the new primary-org roles can still hold one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', roles: ['SUPERVISOR'] });
      await service.updateMembershipRoles('user-1', 'org-1', ['MANAGER', 'CASHIER']);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { roles: ['MANAGER', 'CASHIER'] } });
    });

    it('updates only the membership row for another org', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-home', roles: ['SUPERVISOR'] });
      prisma.userOrganization.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateMembershipRoles('user-1', 'org-1', ['ADMIN']);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.userOrganization.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', organizationId: 'org-1' },
        data: { roles: ['ADMIN'] },
      });
      expect(result.isDefault).toBe(false);
    });

    it('404s when the user is not a member of that org', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', firstName: 'Agishi', organizationId: 'org-home', roles: [] });
      prisma.userOrganization.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateMembershipRoles('user-1', 'org-1', ['ADMIN'])).rejects.toThrow(NotFoundException);
    });
  });
});
