-- Hotfix: restore missing auth columns required by NextAuth/Prisma user model.
-- Some production databases were initialized without Users.role / Users.suspended.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'UserRole'
  ) THEN
    CREATE TYPE "UserRole" AS ENUM ('user', 'admin');
  END IF;
END $$;

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "suspended" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Users_role_idx" ON "Users"("role");
CREATE INDEX IF NOT EXISTS "Users_suspended_idx" ON "Users"("suspended");
