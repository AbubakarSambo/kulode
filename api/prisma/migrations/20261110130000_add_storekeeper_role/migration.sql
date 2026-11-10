-- Retail-only role for the person who counts, receives and writes off stock. Off the
-- WAITER → MANAGER floor ladder; see api/src/common/permissions.ts.
ALTER TYPE "UserRole" ADD VALUE 'STOREKEEPER';
