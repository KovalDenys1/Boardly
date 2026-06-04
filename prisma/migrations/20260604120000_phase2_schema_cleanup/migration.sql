-- Drop Sessions table (unused — JWT auth strategy, never written to)
DROP TABLE IF EXISTS "Sessions";

-- Drop VerificationTokens table (unused — custom EmailVerificationTokens used instead)
DROP TABLE IF EXISTS "VerificationTokens";

-- Drop redundant ordered-pair unique index on FriendRequests
-- FriendRequests_pending_unordered_pair_unique_idx covers the correct constraint
DROP INDEX IF EXISTS "FriendRequests_senderId_receiverId_key";

-- Add DEFAULT to Games.updatedAt for consistency with all other timestamp columns
ALTER TABLE "Games" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Change Lobbies.gameType from text to GameType enum
-- All existing values are valid GameType enum members; drop default first to allow type cast
ALTER TABLE "Lobbies" ALTER COLUMN "gameType" DROP DEFAULT;
ALTER TABLE "Lobbies" ALTER COLUMN "gameType" TYPE "GameType" USING "gameType"::"GameType";
ALTER TABLE "Lobbies" ALTER COLUMN "gameType" SET DEFAULT 'yahtzee'::"GameType";

-- Note: Players.scorecard text→jsonb deferred (requires coordinated refactor across
-- state/route.ts, bot-turn/route.ts and other game engine files that use JSON.stringify/parse)
