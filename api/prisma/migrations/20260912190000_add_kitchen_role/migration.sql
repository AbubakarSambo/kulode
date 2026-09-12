-- Dedicated role for the staff member actually assigned to prep an order item, distinct from
-- PASS/RUNNER (who ferry tickets/food). See api/src/common/decorators/roles.decorator.ts.
ALTER TYPE "UserRole" ADD VALUE 'KITCHEN';
