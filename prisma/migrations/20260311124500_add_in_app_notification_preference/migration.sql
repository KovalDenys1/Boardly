ALTER TABLE "NotificationPreferences"
ADD COLUMN IF NOT EXISTS "inAppNotifications" BOOLEAN NOT NULL DEFAULT true;
