-- Create table for replay snapshots per game action
CREATE TABLE IF NOT EXISTS "GameStateSnapshots" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "turnNumber" INTEGER NOT NULL,
  "playerId" TEXT,
  "actionType" TEXT NOT NULL,
  "actionPayload" JSONB,
  "stateCompressed" TEXT NOT NULL,
  "stateEncoding" TEXT NOT NULL DEFAULT 'gzip-base64',
  "stateSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GameStateSnapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GameStateSnapshots_gameId_createdAt_idx"
  ON "GameStateSnapshots"("gameId", "createdAt");

CREATE INDEX IF NOT EXISTS "GameStateSnapshots_gameId_turnNumber_idx"
  ON "GameStateSnapshots"("gameId", "turnNumber");

ALTER TABLE "GameStateSnapshots"
  ADD CONSTRAINT "GameStateSnapshots_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Games"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
