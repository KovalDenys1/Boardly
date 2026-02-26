CREATE TABLE "Notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "dedupeKey" TEXT,
  "reason" TEXT,
  "payload" JSONB,
  "processedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notifications_userId_createdAt_idx" ON "Notifications"("userId", "createdAt");
CREATE INDEX "Notifications_type_channel_status_createdAt_idx" ON "Notifications"("type", "channel", "status", "createdAt");
CREATE INDEX "Notifications_dedupeKey_idx" ON "Notifications"("dedupeKey");

ALTER TABLE "Notifications"
ADD CONSTRAINT "Notifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
