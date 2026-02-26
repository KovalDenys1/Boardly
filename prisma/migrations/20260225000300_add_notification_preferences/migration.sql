CREATE TABLE "NotificationPreferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameInvites" BOOLEAN NOT NULL DEFAULT true,
  "turnReminders" BOOLEAN NOT NULL DEFAULT true,
  "friendRequests" BOOLEAN NOT NULL DEFAULT true,
  "friendAccepted" BOOLEAN NOT NULL DEFAULT true,
  "unsubscribedAll" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");
CREATE INDEX "NotificationPreferences_userId_idx" ON "NotificationPreferences"("userId");

ALTER TABLE "NotificationPreferences"
ADD CONSTRAINT "NotificationPreferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
