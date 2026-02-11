-- AlterTable
ALTER TABLE "User" ADD COLUMN     "botDifficulty" TEXT,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Game_lobbyId_idx" ON "Game"("lobbyId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt");

-- CreateIndex
CREATE INDEX "Lobby_isActive_idx" ON "Lobby"("isActive");

-- CreateIndex
CREATE INDEX "Lobby_createdAt_idx" ON "Lobby"("createdAt");

-- CreateIndex
CREATE INDEX "Lobby_creatorId_idx" ON "Lobby"("creatorId");

-- CreateIndex
CREATE INDEX "Player_gameId_idx" ON "Player"("gameId");

-- CreateIndex
CREATE INDEX "Player_userId_idx" ON "Player"("userId");
