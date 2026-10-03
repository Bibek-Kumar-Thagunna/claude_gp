CREATE TYPE "SupportAssistantSessionStatus" AS ENUM ('ACTIVE', 'ESCALATED', 'CLOSED');
CREATE TYPE "SupportAssistantRole" AS ENUM ('CUSTOMER', 'ASSISTANT');

CREATE TABLE "SupportAssistantSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "SupportAssistantSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "ticketId" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportAssistantSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAssistantMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" "SupportAssistantRole" NOT NULL,
  "body" TEXT NOT NULL,
  "clientMessageId" TEXT,
  "sourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" DOUBLE PRECISION,
  "provider" TEXT,
  "shouldEscalate" BOOLEAN NOT NULL DEFAULT false,
  "escalationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportAssistantSession_ticketId_key" ON "SupportAssistantSession"("ticketId");
CREATE INDEX "SupportAssistantSession_userId_lastMessageAt_idx" ON "SupportAssistantSession"("userId", "lastMessageAt");
CREATE INDEX "SupportAssistantSession_status_idx" ON "SupportAssistantSession"("status");
CREATE UNIQUE INDEX "SupportAssistantMessage_sessionId_clientMessageId_key" ON "SupportAssistantMessage"("sessionId", "clientMessageId");
CREATE INDEX "SupportAssistantMessage_sessionId_createdAt_idx" ON "SupportAssistantMessage"("sessionId", "createdAt");

ALTER TABLE "SupportAssistantSession"
  ADD CONSTRAINT "SupportAssistantSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportAssistantSession"
  ADD CONSTRAINT "SupportAssistantSession_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportAssistantMessage"
  ADD CONSTRAINT "SupportAssistantMessage_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "SupportAssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
