ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'COMPLETED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' BEFORE 'COMPLETED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'FAILED' AFTER 'COMPLETED';
ALTER TYPE "FinanceJournalType" ADD VALUE IF NOT EXISTS 'REFUND_RECOVERY';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'PLATFORM_PROMOTION_EXPENSE';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'SELLER_RECOVERY_RECEIVABLE_ASSET';

ALTER TABLE "PaymentIntent" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "reference" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_attempt_check" CHECK ("attempt" > 0),
  CONSTRAINT "PaymentAttempt_paymentIntentId_fkey"
    FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentAttempt_paymentIntentId_attempt_key" ON "PaymentAttempt"("paymentIntentId", "attempt");
CREATE INDEX "PaymentAttempt_reference_idx" ON "PaymentAttempt"("reference");

INSERT INTO "PaymentAttempt" ("id", "paymentIntentId", "attempt", "status", "reference", "rawPayload", "createdAt", "updatedAt")
SELECT 'backfill-' || "id", "id", 1, "status", "reference", "rawPayload", "createdAt", "updatedAt"
FROM "PaymentIntent";

ALTER TABLE "OrderFinance"
  ADD COLUMN "couponDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "platformFundedDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sellerFundedDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundReservedAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "OrderFinance" f
SET "couponDiscount" = o."discount",
    "loyaltyDiscount" = o."loyaltyDiscount",
    "platformFundedDiscount" = o."loyaltyDiscount" + CASE WHEN c."shopId" IS NULL THEN o."discount" ELSE 0 END,
    "sellerFundedDiscount" = CASE WHEN c."shopId" IS NULL THEN 0 ELSE o."discount" END
FROM "Order" o
LEFT JOIN "Coupon" c ON c."id" = o."couponId"
WHERE f."orderId" = o."id";

ALTER TABLE "OrderFinance" DROP CONSTRAINT IF EXISTS "OrderFinance_amounts_check";
ALTER TABLE "OrderFinance" ADD CONSTRAINT "OrderFinance_amounts_check" CHECK (
  "grossAmount" >= 0 AND "couponDiscount" >= 0 AND "loyaltyDiscount" >= 0 AND
  "platformFundedDiscount" >= 0 AND "sellerFundedDiscount" >= 0 AND
  "commissionBase" >= 0 AND "deliveryFee" >= 0 AND
  "commissionRateBps" BETWEEN 0 AND 10000 AND "commissionAmount" >= 0 AND
  "sellerNetAmount" >= 0 AND "refundAmount" >= 0 AND "refundReservedAmount" >= 0 AND
  "refundAmount" + "refundReservedAmount" <= "grossAmount"
);

ALTER TABLE "Refund"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);
UPDATE "Refund" SET "completedAt" = "createdAt" WHERE "status" = 'COMPLETED';

ALTER TABLE "CouponRedemption" ADD COLUMN "releasedAt" TIMESTAMP(3);
CREATE INDEX "CouponRedemption_couponId_userId_releasedAt_idx"
  ON "CouponRedemption"("couponId", "userId", "releasedAt");

ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_definition_check" CHECK (
  "value" > 0 AND
  ("type" <> 'PERCENT' OR "value" <= 100) AND
  "minOrder" >= 0 AND
  ("maxDiscount" IS NULL OR "maxDiscount" > 0) AND
  ("usageLimit" IS NULL OR "usageLimit" > 0) AND
  "perUserLimit" > 0 AND
  "usedCount" >= 0 AND
  ("usageLimit" IS NULL OR "usedCount" <= "usageLimit") AND
  ("validTo" IS NULL OR "validTo" > "validFrom")
);
