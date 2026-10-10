import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    userOrganization: {
      upsert: jest.fn(),
    },
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
    it('returns the user with their organization memberships', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@acme.com',
        organizationMemberships: [{ organizationId: 'org-1', roles: ['ADMIN'], isDefault: true }],
      });

      const result = await service.findUserByEmail('admin@acme.com');

      expect(result.id).toBe('user-1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@acme.com' } }),
      );
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
});
