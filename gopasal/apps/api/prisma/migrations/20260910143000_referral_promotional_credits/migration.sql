ALTER TABLE "Referral"
  ADD COLUMN "qualifiedOrderId" TEXT,
  ADD COLUMN "qualifiedAt" TIMESTAMP(3),
  ADD COLUMN "rewardedAt" TIMESTAMP(3),
  ADD COLUMN "referrerReward" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refereeReward" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;

UPDATE "User" AS customer
SET "referralCode" = anchor."code"
FROM (
  SELECT DISTINCT ON ("referrerId") "referrerId", "code"
  FROM "Referral"
  WHERE "refereeId" IS NULL
  ORDER BY "referrerId", "createdAt" ASC
) AS anchor
WHERE customer."id" = anchor."referrerId";

ALTER TABLE "Order"
  ADD COLUMN "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Referral_qualifiedOrderId_key" ON "Referral"("qualifiedOrderId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "LoyaltyTransaction_userId_orderId_reason_key"
  ON "LoyaltyTransaction"("userId", "orderId", "reason");
