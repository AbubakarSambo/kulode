-- Add kitchen/back-of-house role values to UserRole (POS-only-org ladder).
-- See api/src/common/decorators/roles.decorator.ts and users.service.ts POS_ROLES.
ALTER TYPE "UserRole" ADD VALUE 'PASS';
ALTER TYPE "UserRole" ADD VALUE 'RUNNER';
