-- Per-item kitchen-flow transition timestamps, for future prep-time reporting and so the
-- kitchen board's timer can freeze once an item is actually served. See OrderItem in schema.prisma.
ALTER TABLE "order_items" ADD COLUMN "on_it_at" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN "passed_at" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN "served_at" TIMESTAMP(3);
