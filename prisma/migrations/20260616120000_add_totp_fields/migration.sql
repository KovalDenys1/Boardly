-- Add per-user TOTP (2FA) fields to Users
-- Required by Control Panel #95 (per-user 2FA) — columns were added to the
-- Control Panel's Prisma schema but never migrated into the actual DB.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "totpPendingSecret" TEXT;
