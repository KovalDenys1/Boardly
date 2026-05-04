-- Make Lobbies.creatorId nullable and change ON DELETE to SET NULL.
-- This prevents guest user deletion from cascading through Lobbies → Games → Players,
-- which would silently destroy registered users' game history.

ALTER TABLE "Lobbies" ALTER COLUMN "creatorId" DROP NOT NULL;

ALTER TABLE "Lobbies" DROP CONSTRAINT "Lobbies_creatorId_fkey";

ALTER TABLE "Lobbies" ADD CONSTRAINT "Lobbies_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
