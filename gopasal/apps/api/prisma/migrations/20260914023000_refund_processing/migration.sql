ALTER TABLE "Refund"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "Refund_status_nextAttemptAt_idx"
  ON "Refund"("status", "nextAttemptAt");
