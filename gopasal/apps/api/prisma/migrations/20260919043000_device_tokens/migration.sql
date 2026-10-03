-- Device push: one row per install that has asked to be told about its orders.
--
-- Additive only: a new table and its indexes, no change to any existing column,
-- so it takes no lock on anything that is being read or written. Expected
-- duration is milliseconds on any size of database. Rolling back is a DROP of
-- this table alone; application code tolerates the table being empty (no
-- tokens simply means no push, and the in-app notification is unaffected), so
-- an older API release runs unchanged against this schema.

CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- One row per token: re-registering the same install updates rather than
-- accumulating duplicates that would each receive the same push.
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- The notification worker's only query: this user's tokens that are still live.
CREATE INDEX "DeviceToken_userId_disabledAt_idx" ON "DeviceToken"("userId", "disabledAt");

ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
