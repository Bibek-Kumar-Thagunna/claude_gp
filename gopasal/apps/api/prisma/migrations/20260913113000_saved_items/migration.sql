-- Persistent, account-owned saved shops and products.
CREATE TABLE "SavedShop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedShop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedShop_userId_shopId_key" ON "SavedShop"("userId", "shopId");
CREATE INDEX "SavedShop_userId_createdAt_idx" ON "SavedShop"("userId", "createdAt");
CREATE INDEX "SavedShop_shopId_idx" ON "SavedShop"("shopId");

CREATE UNIQUE INDEX "SavedProduct_userId_productId_key" ON "SavedProduct"("userId", "productId");
CREATE INDEX "SavedProduct_userId_createdAt_idx" ON "SavedProduct"("userId", "createdAt");
CREATE INDEX "SavedProduct_productId_idx" ON "SavedProduct"("productId");

ALTER TABLE "SavedShop" ADD CONSTRAINT "SavedShop_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedShop" ADD CONSTRAINT "SavedShop_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedProduct" ADD CONSTRAINT "SavedProduct_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedProduct" ADD CONSTRAINT "SavedProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
