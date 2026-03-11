DO $$
BEGIN
  BEGIN
    ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'in_app';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'push';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END
$$;

ALTER TABLE "Notifications"
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "Notifications_userId_channel_createdAt_idx"
  ON "Notifications"("userId", "channel", "createdAt");

CREATE INDEX IF NOT EXISTS "Notifications_userId_channel_readAt_createdAt_idx"
  ON "Notifications"("userId", "channel", "readAt", "createdAt");
