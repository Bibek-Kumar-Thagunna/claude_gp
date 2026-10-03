CREATE TYPE "PrivateObjectDeletionStatus" AS ENUM ('PENDING', 'DELETED');

ALTER TABLE "RetentionRun"
  ADD COLUMN "objectScanned" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "objectsRemoved" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "objectFailed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "objectHeld" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PrivateObjectDeletion" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "PrivateObjectDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PrivateObjectDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivateObjectDeletion_storageKey_key" ON "PrivateObjectDeletion"("storageKey");
CREATE INDEX "PrivateObjectDeletion_status_createdAt_id_idx" ON "PrivateObjectDeletion"("status", "createdAt", "id");
CREATE INDEX "PrivateObjectDeletion_userId_status_idx" ON "PrivateObjectDeletion"("userId", "status");
