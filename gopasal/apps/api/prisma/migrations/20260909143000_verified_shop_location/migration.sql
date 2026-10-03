ALTER TABLE "ShopApplication"
  ADD COLUMN "locationAccuracyM" DOUBLE PRECISION,
  ADD COLUMN "locationCapturedAt" TIMESTAMP(3),
  ADD COLUMN "locationCaptureMethod" TEXT;

ALTER TABLE "Shop"
  ADD COLUMN "locationAccuracyM" DOUBLE PRECISION,
  ADD COLUMN "locationCapturedAt" TIMESTAMP(3),
  ADD COLUMN "locationCaptureMethod" TEXT;
