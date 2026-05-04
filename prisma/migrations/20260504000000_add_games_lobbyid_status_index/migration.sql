-- Add composite index for the most common game lookup pattern:
-- WHERE lobbyId = ? AND status IN ('waiting', 'playing')
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Games_lobbyId_status_idx" ON "Games"("lobbyId", "status");
