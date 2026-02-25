-- Add spectator mode settings and denormalized count to lobbies
ALTER TABLE "Lobbies"
ADD COLUMN "allowSpectators" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxSpectators" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "spectatorCount" INTEGER NOT NULL DEFAULT 0;
