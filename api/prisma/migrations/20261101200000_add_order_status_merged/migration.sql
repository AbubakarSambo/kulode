-- Merged/moved-out orders get their own status instead of CANCELLED so they aren't reported as voids.
ALTER TYPE "OrderStatus" ADD VALUE 'MERGED';
