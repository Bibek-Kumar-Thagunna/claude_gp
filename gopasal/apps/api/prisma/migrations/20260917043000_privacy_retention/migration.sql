-- Phase 9: durable deletion lifecycle, configurable retention and legal holds.

CREATE TYPE "DataErasureStatus" AS ENUM ('ANONYMIZED', 'PURGED');
CREATE TYPE "RetentionRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "DataErasureRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DataErasureStatus" NOT NULL DEFAULT 'ANONYMIZED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeEligibleAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataErasureRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legalBasis" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT 'USER',
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseReason" TEXT,
    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "status" "RetentionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "source" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "actorId" TEXT,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "purged" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataErasureRequest_userId_key" ON "DataErasureRequest"("userId");
CREATE INDEX "DataErasureRequest_status_purgeEligibleAt_idx" ON "DataErasureRequest"("status", "purgeEligibleAt");
CREATE UNIQUE INDEX "RetentionPolicy_key_key" ON "RetentionPolicy"("key");
CREATE INDEX "LegalHold_subjectType_subjectId_releasedAt_idx" ON "LegalHold"("subjectType", "subjectId", "releasedAt");
CREATE INDEX "LegalHold_expiresAt_idx" ON "LegalHold"("expiresAt");
CREATE INDEX "RetentionRun_startedAt_idx" ON "RetentionRun"("startedAt");
CREATE INDEX "RetentionRun_status_idx" ON "RetentionRun"("status");

ALTER TABLE "DataErasureRequest" ADD CONSTRAINT "DataErasureRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_placedById_fkey"
  FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Five years is the conservative baseline from Companies Act 2063 section
-- 108(8). It remains configurable because launch counsel may require a longer
-- category-specific period.
INSERT INTO "RetentionPolicy" ("id", "key", "days", "description", "legalBasis") VALUES
  ('retention_deleted_order_pii', 'deleted_account_order_pii', 1825,
   'Retain transaction-linked personal snapshots after account deletion, then redact the personal fields while preserving accounting totals.',
   'Companies Act 2063 section 108(8): accounting and annual financial statements retained at least five years.')
ON CONFLICT ("key") DO NOTHING;

-- Backfill accounts anonymised before this lifecycle table existed.
INSERT INTO "DataErasureRequest" (
  "id", "userId", "status", "requestedAt", "anonymizedAt", "purgeEligibleAt"
)
SELECT
  'der_' || md5("id"), "id", 'ANONYMIZED', "updatedAt", "updatedAt",
  "updatedAt" + INTERVAL '1825 days'
FROM "User"
WHERE "status" = 'DELETED'
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "Permission" ("key", "label", "description", "scope", "group") VALUES
  ('privacy.view', 'View privacy compliance', 'Read retention policies, deletion lifecycle and legal holds.', 'PLATFORM', 'Compliance'),
  ('privacy.manage', 'Manage privacy compliance', 'Place or release legal holds, change retention policy and run expiry processing.', 'PLATFORM', 'Compliance')
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "scope" = EXCLUDED."scope",
  "group" = EXCLUDED."group";

INSERT INTO "RolePermission" ("roleId", "permissionKey")
SELECT "id", permission_key
FROM "Role"
CROSS JOIN (VALUES ('privacy.view'), ('privacy.manage')) AS p(permission_key)
WHERE "scope" = 'PLATFORM' AND "shopId" IS NULL AND "name" = 'Compliance Reviewer'
ON CONFLICT DO NOTHING;
