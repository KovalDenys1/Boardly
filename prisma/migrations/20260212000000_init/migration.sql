-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('waiting', 'playing', 'finished', 'abandoned', 'cancelled');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('yahtzee', 'tic_tac_toe', 'rock_paper_scissors', 'chess', 'guess_the_spy', 'uno', 'other');

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "username" TEXT,
    "friendCode" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botType" TEXT NOT NULL DEFAULT 'yahtzee',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationTokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetTokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationTokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lobbies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "turnTimer" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "gameType" TEXT NOT NULL DEFAULT 'yahtzee',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creatorId" TEXT NOT NULL,

    CONSTRAINT "Lobbies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Games" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'waiting',
    "gameType" "GameType" NOT NULL DEFAULT 'yahtzee',
    "abandonedAt" TIMESTAMP(3),
    "currentTurn" INTEGER NOT NULL DEFAULT 0,
    "lastMoveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "finalScore" INTEGER,
    "placement" INTEGER,
    "scorecard" TEXT,
    "position" INTEGER NOT NULL,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRequests" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRequests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendships" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpyLocations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "roles" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SpyLocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Users_friendCode_key" ON "Users"("friendCode");

-- CreateIndex
CREATE INDEX "Users_isGuest_lastActiveAt_idx" ON "Users"("isGuest", "lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bots_userId_key" ON "Bots"("userId");

-- CreateIndex
CREATE INDEX "Bots_userId_idx" ON "Bots"("userId");

-- CreateIndex
CREATE INDEX "Bots_botType_idx" ON "Bots"("botType");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_provider_providerAccountId_key" ON "Accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Sessions_sessionToken_key" ON "Sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationTokens_token_key" ON "VerificationTokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationTokens_identifier_token_key" ON "VerificationTokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetTokens_token_key" ON "PasswordResetTokens"("token");

-- CreateIndex
CREATE INDEX "PasswordResetTokens_userId_idx" ON "PasswordResetTokens"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetTokens_token_idx" ON "PasswordResetTokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationTokens_token_key" ON "EmailVerificationTokens"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationTokens_userId_idx" ON "EmailVerificationTokens"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationTokens_token_idx" ON "EmailVerificationTokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Lobbies_code_key" ON "Lobbies"("code");

-- CreateIndex
CREATE INDEX "Lobbies_isActive_idx" ON "Lobbies"("isActive");

-- CreateIndex
CREATE INDEX "Lobbies_createdAt_idx" ON "Lobbies"("createdAt");

-- CreateIndex
CREATE INDEX "Lobbies_creatorId_idx" ON "Lobbies"("creatorId");

-- CreateIndex
CREATE INDEX "Games_lobbyId_idx" ON "Games"("lobbyId");

-- CreateIndex
CREATE INDEX "Games_status_idx" ON "Games"("status");

-- CreateIndex
CREATE INDEX "Games_createdAt_idx" ON "Games"("createdAt");

-- CreateIndex
CREATE INDEX "Players_gameId_idx" ON "Players"("gameId");

-- CreateIndex
CREATE INDEX "Players_userId_idx" ON "Players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Players_gameId_userId_key" ON "Players"("gameId", "userId");

-- CreateIndex
CREATE INDEX "FriendRequests_senderId_idx" ON "FriendRequests"("senderId");

-- CreateIndex
CREATE INDEX "FriendRequests_receiverId_idx" ON "FriendRequests"("receiverId");

-- CreateIndex
CREATE INDEX "FriendRequests_status_idx" ON "FriendRequests"("status");

-- CreateIndex
CREATE INDEX "FriendRequests_createdAt_idx" ON "FriendRequests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequests_senderId_receiverId_key" ON "FriendRequests"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "Friendships_user1Id_idx" ON "Friendships"("user1Id");

-- CreateIndex
CREATE INDEX "Friendships_user2Id_idx" ON "Friendships"("user2Id");

-- CreateIndex
CREATE INDEX "Friendships_createdAt_idx" ON "Friendships"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Friendships_user1Id_user2Id_key" ON "Friendships"("user1Id", "user2Id");

-- CreateIndex
CREATE UNIQUE INDEX "SpyLocations_name_key" ON "SpyLocations"("name");

-- CreateIndex
CREATE INDEX "SpyLocations_category_idx" ON "SpyLocations"("category");

-- CreateIndex
CREATE INDEX "SpyLocations_isActive_idx" ON "SpyLocations"("isActive");

-- AddForeignKey
ALTER TABLE "Bots" ADD CONSTRAINT "Bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accounts" ADD CONSTRAINT "Accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessions" ADD CONSTRAINT "Sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobbies" ADD CONSTRAINT "Lobbies_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Games" ADD CONSTRAINT "Games_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobbies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Players" ADD CONSTRAINT "Players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Players" ADD CONSTRAINT "Players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequests" ADD CONSTRAINT "FriendRequests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequests" ADD CONSTRAINT "FriendRequests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendships" ADD CONSTRAINT "Friendships_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendships" ADD CONSTRAINT "Friendships_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

