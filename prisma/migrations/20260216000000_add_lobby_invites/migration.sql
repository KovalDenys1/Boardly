-- ============================================================================
-- Migration: Add LobbyInvites table for social invite conversion analytics
-- Date: 2026-02-16
-- ============================================================================

CREATE TABLE "LobbyInvites" (
  "id" TEXT NOT NULL,
  "lobbyId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'friends',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LobbyInvites_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LobbyInvites"
  ADD CONSTRAINT "LobbyInvites_lobbyId_fkey"
  FOREIGN KEY ("lobbyId") REFERENCES "Lobbies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LobbyInvites"
  ADD CONSTRAINT "LobbyInvites_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "Users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LobbyInvites"
  ADD CONSTRAINT "LobbyInvites_inviteeId_fkey"
  FOREIGN KEY ("inviteeId") REFERENCES "Users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LobbyInvites_lobbyId_idx" ON "LobbyInvites"("lobbyId");
CREATE INDEX "LobbyInvites_inviterId_idx" ON "LobbyInvites"("inviterId");
CREATE INDEX "LobbyInvites_inviteeId_idx" ON "LobbyInvites"("inviteeId");
CREATE INDEX "LobbyInvites_sentAt_idx" ON "LobbyInvites"("sentAt");
CREATE INDEX "LobbyInvites_acceptedAt_idx" ON "LobbyInvites"("acceptedAt");

-- RLS
ALTER TABLE "LobbyInvites" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lobby invites"
  ON "LobbyInvites" FOR SELECT
  USING (
    "inviterId" = get_current_user_id()
    OR "inviteeId" = get_current_user_id()
  );

CREATE POLICY "Users can create own lobby invites"
  ON "LobbyInvites" FOR INSERT
  WITH CHECK ("inviterId" = get_current_user_id());

CREATE POLICY "Service role can manage lobby invites"
  ON "LobbyInvites" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Grants for roles (new table after initial RLS migration)
GRANT SELECT, INSERT, UPDATE, DELETE ON "LobbyInvites" TO authenticated;
GRANT ALL ON "LobbyInvites" TO service_role;
