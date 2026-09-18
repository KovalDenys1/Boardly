-- The host's only tool against a griefer was `prisma.players.delete` and a broadcast:
-- nothing recorded that the decision had been made. The kicked player re-opened the same
-- invite link and the public-lobby auto-join put them back in the room with no click at
-- all, so the host could only keep kicking or abandon the code (#1013).
--
-- A column rather than a table: the list is short, it is only ever read alongside the
-- lobby row the join paths already fetch, and it dies with the lobby.
ALTER TABLE "Lobbies"
  ADD COLUMN IF NOT EXISTS "kickedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
