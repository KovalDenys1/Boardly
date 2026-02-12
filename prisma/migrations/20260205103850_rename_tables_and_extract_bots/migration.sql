-- ============================================
-- Migration: Rename tables to plural and extract Bots table
-- Date: 2026-02-05
-- Description: 
--   1. Rename all 12 tables from singular to plural
--   2. Create new Bots table with one-to-one relation to Users
--   3. Migrate existing bot data (isBot=true users) to Bots table
--   4. Drop isBot column from Users table
-- ============================================

-- STEP 1: Rename all tables to plural
-- Order matters: foreign key constraints will be preserved by PostgreSQL

-- Rename Users table (must be first, referenced by many tables)
ALTER TABLE "User" RENAME TO "Users";

-- Rename authentication tables
ALTER TABLE "Account" RENAME TO "Accounts";
ALTER TABLE "Session" RENAME TO "Sessions";
ALTER TABLE "VerificationToken" RENAME TO "VerificationTokens";

-- Rename custom token tables
ALTER TABLE "PasswordResetToken" RENAME TO "PasswordResetTokens";
ALTER TABLE "EmailVerificationToken" RENAME TO "EmailVerificationTokens";

-- Skip friendship tables (not created yet in previous migrations)
-- ALTER TABLE "Friendship" RENAME TO "Friendships";
-- ALTER TABLE "FriendRequest" RENAME TO "FriendRequests";

-- Rename game tables
ALTER TABLE "Lobby" RENAME TO "Lobbies";
ALTER TABLE "Game" RENAME TO "Games";
ALTER TABLE "Player" RENAME TO "Players";
-- ALTER TABLE "SpyLocation" RENAME TO "SpyLocations"; -- Not created yet

-- STEP 2: Create Bots table
CREATE TABLE "Bots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botType" TEXT NOT NULL DEFAULT 'yahtzee',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bots_pkey" PRIMARY KEY ("id")
);

-- Create unique index on userId
CREATE UNIQUE INDEX "Bots_userId_key" ON "Bots"("userId");

-- Add foreign key constraint to Users table
ALTER TABLE "Bots" ADD CONSTRAINT "Bots_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "Users"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- STEP 3: Migrate existing bot users to Bots table
-- Find all users with isBot=true and create corresponding records in Bots table
INSERT INTO "Bots" ("id", "userId", "botType", "difficulty", "createdAt")
SELECT 
    gen_random_uuid()::text,
    id,
    'yahtzee',  -- All existing bots are Yahtzee bots
    'medium',   -- Default difficulty
    "createdAt"
FROM "Users"
WHERE "isBot" = true;

-- STEP 4: Drop isBot column from Users table
-- This is safe now that all bot data is in Bots table
ALTER TABLE "Users" DROP COLUMN "isBot";

-- ============================================
-- Verification queries (run after migration):
-- ============================================
-- SELECT COUNT(*) AS bot_count FROM "Bots";
-- SELECT COUNT(*) AS user_count FROM "Users";
-- SELECT u.username, b.botType, b.difficulty 
-- FROM "Users" u 
-- INNER JOIN "Bots" b ON u.id = b."userId" 
-- LIMIT 5;
