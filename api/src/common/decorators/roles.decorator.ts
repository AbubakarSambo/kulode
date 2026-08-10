import { SetMetadata } from '@nestjs/common';

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  STAFF = 'STAFF',
  // POS-only-org roles (see api/prisma/schema.prisma UserRole for the matching DB enum).
  MANAGER = 'MANAGER',
  SUPERVISOR = 'SUPERVISOR',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
