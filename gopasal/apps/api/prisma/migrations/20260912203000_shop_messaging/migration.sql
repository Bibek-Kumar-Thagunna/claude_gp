CREATE TYPE "ConversationKind" AS ENUM ('PRE_ORDER', 'ORDER');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "ConversationSender" AS ENUM ('CUSTOMER', 'SHOP', 'SYSTEM');

CREATE TABLE "ShopConversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "contextKey" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerLastReadAt" TIMESTAMP(3),
    "shopLastReadAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sender" "ConversationSender" NOT NULL,
    "body" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopConversation_orderId_key" ON "ShopConversation"("orderId");
CREATE UNIQUE INDEX "ShopConversation_shopId_customerId_contextKey_key" ON "ShopConversation"("shopId", "customerId", "contextKey");
CREATE INDEX "ShopConversation_customerId_lastMessageAt_idx" ON "ShopConversation"("customerId", "lastMessageAt");
CREATE INDEX "ShopConversation_shopId_lastMessageAt_idx" ON "ShopConversation"("shopId", "lastMessageAt");
CREATE UNIQUE INDEX "ShopMessage_conversationId_clientMessageId_key" ON "ShopMessage"("conversationId", "clientMessageId");
CREATE INDEX "ShopMessage_conversationId_createdAt_idx" ON "ShopMessage"("conversationId", "createdAt");

ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMessage" ADD CONSTRAINT "ShopMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMessage" ADD CONSTRAINT "ShopMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions are deployment data, not demo seed data. Existing production
-- databases receive the keys and the standard templates receive sensible grants.
INSERT INTO "Permission" ("key", "label", "description", "scope", "group") VALUES
  ('messages.view', 'View customer messages', NULL, 'SHOP', 'Messages'),
  ('messages.respond', 'Reply to customers', NULL, 'SHOP', 'Messages')
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label", "scope" = EXCLUDED."scope", "group" = EXCLUDED."group";

INSERT INTO "RolePermission" ("roleId", "permissionKey")
SELECT r."id", p."key"
FROM "Role" r
CROSS JOIN (VALUES ('messages.view'), ('messages.respond')) AS p("key")
WHERE r."scope" = 'SHOP' AND r."shopId" IS NULL
  AND r."name" IN ('Manager', 'Order Handler', 'Support Staff')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
