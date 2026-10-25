import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS, Permission } from '../permissions';

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
  PASS = 'PASS',
  RUNNER = 'RUNNER',
  KITCHEN = 'KITCHEN',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// Role check sourced from the shared permission matrix (common/permissions.ts) rather than an
// inline role list — keeps the API and client from drifting apart.
export const Can = (permission: Permission) => Roles(...(PERMISSIONS[permission] as readonly string[] as Role[]));
