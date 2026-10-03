-- Phase 1 platform configuration and feature flags are append-only. A new
-- operational change inserts a version instead of overwriting history.
CREATE TYPE "ConfigEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

CREATE TABLE "PlatformConfigVersion" (
    "id" TEXT NOT NULL,
    "environment" "ConfigEnvironment" NOT NULL,
    "version" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "baseDeliveryFee" INTEGER NOT NULL,
    "perKmDeliveryFee" INTEGER NOT NULL,
    "codLimit" INTEGER NOT NULL,
    "refundWindowHours" INTEGER NOT NULL,
    "changeNote" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformConfigVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlagVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "environment" "ConfigEnvironment" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "shopId" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNote" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureFlagVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformConfigVersion_environment_version_key" ON "PlatformConfigVersion"("environment", "version");
CREATE INDEX "PlatformConfigVersion_environment_createdAt_idx" ON "PlatformConfigVersion"("environment", "createdAt");
CREATE UNIQUE INDEX "FeatureFlagVersion_environment_targetKey_key_version_key" ON "FeatureFlagVersion"("environment", "targetKey", "key", "version");
CREATE INDEX "FeatureFlagVersion_environment_targetKey_key_createdAt_idx" ON "FeatureFlagVersion"("environment", "targetKey", "key", "createdAt");
CREATE INDEX "FeatureFlagVersion_shopId_idx" ON "FeatureFlagVersion"("shopId");

ALTER TABLE "PlatformConfigVersion" ADD CONSTRAINT "PlatformConfigVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagVersion" ADD CONSTRAINT "FeatureFlagVersion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagVersion" ADD CONSTRAINT "FeatureFlagVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
