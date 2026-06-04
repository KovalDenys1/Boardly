-- Add pushNotifications preference field
ALTER TABLE "NotificationPreferences" ADD COLUMN IF NOT EXISTS "pushNotifications" BOOLEAN NOT NULL DEFAULT false;

-- Create PushSubscriptions table
CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
  "id"        TEXT           NOT NULL,
  "userId"    TEXT           NOT NULL,
  "endpoint"  TEXT           NOT NULL,
  "p256dh"    TEXT           NOT NULL,
  "auth"      TEXT           NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscriptions_endpoint_key" ON "PushSubscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscriptions_userId_idx" ON "PushSubscriptions"("userId");

ALTER TABLE "PushSubscriptions"
  ADD CONSTRAINT "PushSubscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscriptions" ENABLE ROW LEVEL SECURITY;
