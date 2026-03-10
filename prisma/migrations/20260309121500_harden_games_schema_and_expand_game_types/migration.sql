-- Expand the persisted GameType enum so experimental game modes can be stored directly.
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'telephone_doodle';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'sketch_and_guess';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'liars_party';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'fake_artist';

-- Align delete semantics with application expectations for lobby/game cleanup.
ALTER TABLE "Lobbies" DROP CONSTRAINT IF EXISTS "Lobbies_creatorId_fkey";
ALTER TABLE "Lobbies"
  ADD CONSTRAINT "Lobbies_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "Users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Games" DROP CONSTRAINT IF EXISTS "Games_lobbyId_fkey";
ALTER TABLE "Games"
  ADD CONSTRAINT "Games_lobbyId_fkey"
  FOREIGN KEY ("lobbyId") REFERENCES "Lobbies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Store authoritative game state as JSONB instead of TEXT.
ALTER TABLE "Games"
  ALTER COLUMN "state" TYPE JSONB
  USING "state"::jsonb;

-- Support per-game-type filtering without full scans.
CREATE INDEX IF NOT EXISTS "Games_gameType_status_idx"
  ON "Games"("gameType", "status");
