ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED' BEFORE 'REFUNDED';

CREATE TYPE "EscrowStatus" AS ENUM ('HELD', 'RELEASED', 'PARTIALLY_REFUNDED', 'REFUNDED');
CREATE TYPE "RefundStatus" AS ENUM ('COMPLETED');
CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_SOURCE', 'MANUAL_TRANSFER', 'STORE_CREDIT');
CREATE TYPE "SettlementDirection" AS ENUM ('PAYOUT_TO_SELLER', 'COLLECTION_FROM_SELLER');
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'PAID', 'FAILED');
CREATE TYPE "FinanceJournalType" AS ENUM ('PAYMENT_CAPTURED', 'ESCROW_RELEASED', 'COD_COMMISSION_ACCRUED', 'REFUND_ISSUED', 'SETTLEMENT_COMPLETED');
CREATE TYPE "LedgerAccount" AS ENUM ('PAYMENT_CLEARING_ASSET', 'CUSTOMER_ESCROW_LIABILITY', 'SELLER_PAYABLE_LIABILITY', 'SELLER_COD_RECEIVABLE_ASSET', 'PLATFORM_COMMISSION_REVENUE');

CREATE TABLE "OrderFinance" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "grossAmount" INTEGER NOT NULL,
  "commissionBase" INTEGER NOT NULL,
  "deliveryFee" INTEGER NOT NULL,
  "commissionRateBps" INTEGER NOT NULL,
  "commissionAmount" INTEGER NOT NULL,
  "sellerNetAmount" INTEGER NOT NULL,
  "refundAmount" INTEGER NOT NULL DEFAULT 0,
  "codAccruedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderFinance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderFinance_amounts_check" CHECK (
    "grossAmount" >= 0 AND "commissionBase" >= 0 AND "deliveryFee" >= 0 AND
    "commissionRateBps" BETWEEN 0 AND 10000 AND "commissionAmount" >= 0 AND
    "sellerNetAmount" >= 0 AND "refundAmount" >= 0 AND "refundAmount" <= "grossAmount"
  )
);

CREATE TABLE "Escrow" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "refundedAmount" INTEGER NOT NULL DEFAULT 0,
  "status" "EscrowStatus" NOT NULL DEFAULT 'HELD',
  "releaseEligibleAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Escrow_amounts_check" CHECK ("amount" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount")
);

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "method" "RefundMethod" NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
  "providerRef" TEXT,
  "issuedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "onlineSellerPayable" INTEGER NOT NULL,
  "codCommissionReceivable" INTEGER NOT NULL,
  "refundAdjustments" INTEGER NOT NULL,
  "netAmount" INTEGER NOT NULL,
  "direction" "SettlementDirection" NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
  "payoutMethod" "PayoutMethod",
  "payoutDestinationMasked" TEXT,
  "providerReference" TEXT,
  "failureReason" TEXT,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Settlement_amounts_check" CHECK (
    "onlineSellerPayable" >= 0 AND "codCommissionReceivable" >= 0 AND "refundAdjustments" >= 0 AND "netAmount" >= 0
  ),
  CONSTRAINT "Settlement_window_check" CHECK ("windowEnd" >= "windowStart")
);

CREATE TABLE "SettlementLine" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "orderFinanceId" TEXT NOT NULL,
  "sellerPayable" INTEGER NOT NULL,
  "codCommission" INTEGER NOT NULL,
  "refundAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementLine_amounts_check" CHECK ("sellerPayable" >= 0 AND "codCommission" >= 0 AND "refundAmount" >= 0)
);

CREATE TABLE "FinanceJournal" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "type" "FinanceJournalType" NOT NULL,
  "description" TEXT NOT NULL,
  "orderId" TEXT,
  "shopId" TEXT,
  "settlementId" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceJournal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "account" "LedgerAccount" NOT NULL,
  "debit" INTEGER NOT NULL DEFAULT 0,
  "credit" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerEntry_side_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);

CREATE UNIQUE INDEX "OrderFinance_orderId_key" ON "OrderFinance"("orderId");
CREATE INDEX "OrderFinance_shopId_createdAt_idx" ON "OrderFinance"("shopId", "createdAt");
CREATE INDEX "OrderFinance_shopId_settledAt_idx" ON "OrderFinance"("shopId", "settledAt");
CREATE UNIQUE INDEX "Escrow_orderId_key" ON "Escrow"("orderId");
CREATE INDEX "Escrow_status_releaseEligibleAt_idx" ON "Escrow"("status", "releaseEligibleAt");
CREATE INDEX "Escrow_shopId_status_idx" ON "Escrow"("shopId", "status");
CREATE UNIQUE INDEX "Refund_code_key" ON "Refund"("code");
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");
CREATE UNIQUE INDEX "Settlement_code_key" ON "Settlement"("code");
CREATE INDEX "Settlement_status_createdAt_idx" ON "Settlement"("status", "createdAt");
CREATE INDEX "Settlement_shopId_createdAt_idx" ON "Settlement"("shopId", "createdAt");
CREATE UNIQUE INDEX "SettlementLine_orderFinanceId_key" ON "SettlementLine"("orderFinanceId");
CREATE INDEX "SettlementLine_settlementId_idx" ON "SettlementLine"("settlementId");
CREATE UNIQUE INDEX "FinanceJournal_eventKey_key" ON "FinanceJournal"("eventKey");
CREATE INDEX "FinanceJournal_orderId_createdAt_idx" ON "FinanceJournal"("orderId", "createdAt");
CREATE INDEX "FinanceJournal_shopId_createdAt_idx" ON "FinanceJournal"("shopId", "createdAt");
CREATE INDEX "FinanceJournal_settlementId_idx" ON "FinanceJournal"("settlementId");
CREATE INDEX "LedgerEntry_journalId_idx" ON "LedgerEntry"("journalId");
CREATE INDEX "LedgerEntry_account_createdAt_idx" ON "LedgerEntry"("account", "createdAt");

ALTER TABLE "OrderFinance" ADD CONSTRAINT "OrderFinance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderFinance" ADD CONSTRAINT "OrderFinance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_orderFinanceId_fkey" FOREIGN KEY ("orderFinanceId") REFERENCES "OrderFinance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceJournal" ADD CONSTRAINT "FinanceJournal_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "FinanceJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ledger history is append-only even if a future application bug attempts a
-- direct update/delete. Corrections are new journals with reversing entries.
CREATE FUNCTION gopasal_reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FinanceJournal_append_only"
BEFORE UPDATE OR DELETE ON "FinanceJournal"
FOR EACH ROW EXECUTE FUNCTION gopasal_reject_ledger_mutation();

CREATE TRIGGER "LedgerEntry_append_only"
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION gopasal_reject_ledger_mutation();
