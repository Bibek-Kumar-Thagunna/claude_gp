-- Deployment precondition (run before applying this migration):
-- SELECT "groupOrderId", COUNT(*)
-- FROM "Order"
-- WHERE "groupOrderId" IS NOT NULL
-- GROUP BY "groupOrderId"
-- HAVING COUNT(*) > 1;
-- The query must return zero rows. This migration deliberately fails instead of
-- choosing which production order to keep when historical duplicates exist.
CREATE UNIQUE INDEX "Order_groupOrderId_key" ON "Order"("groupOrderId");

-- A second precondition for the relation the group-order service already reads:
-- SELECT go."id", go."shopId"
-- FROM "GroupOrder" go
-- LEFT JOIN "Shop" s ON s."id" = go."shopId"
-- WHERE s."id" IS NULL;
-- This query must also return zero rows; no orphan is silently deleted or reassigned.
CREATE INDEX "GroupOrder_shopId_idx" ON "GroupOrder"("shopId");
ALTER TABLE "GroupOrder"
ADD CONSTRAINT "GroupOrder_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
