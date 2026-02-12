-- ============================================================================
-- Migration: Sync Database Constraints and Indices with Prisma Schema
-- Date: 2026-02-12
-- Description:
--   This migration synchronizes all database constraint names, index names,
--   and foreign key names with Prisma naming conventions after table renames.
--   Also adds missing GameType enum values and Bots table indices.
--
-- Changes:
--   1. Add new GameType enum values (tic_tac_toe, rock_paper_scissors)
--   2. Rename all primary key constraints to match plural table names
--   3. Rename all foreign key constraints to Prisma conventions
--   4. Rename all indices to match plural table names
--   5. Add missing indices for Bots table (userId, botType)
-- ============================================================================

-- Add new game types to enum
ALTER TYPE "GameType" ADD VALUE 'tic_tac_toe';
ALTER TYPE "GameType" ADD VALUE 'rock_paper_scissors';

-- AlterTable
ALTER TABLE "Accounts" RENAME CONSTRAINT "Account_pkey" TO "Accounts_pkey";

-- AlterTable
ALTER TABLE "EmailVerificationTokens" RENAME CONSTRAINT "EmailVerificationToken_pkey" TO "EmailVerificationTokens_pkey";

-- AlterTable
ALTER TABLE "FriendRequests" RENAME CONSTRAINT "FriendRequest_pkey" TO "FriendRequests_pkey";

-- AlterTable
ALTER TABLE "Friendships" RENAME CONSTRAINT "Friendship_pkey" TO "Friendships_pkey";

-- AlterTable
ALTER TABLE "Games" RENAME CONSTRAINT "Game_pkey" TO "Games_pkey";

-- AlterTable
ALTER TABLE "Lobbies" RENAME CONSTRAINT "Lobby_pkey" TO "Lobbies_pkey";

-- AlterTable
ALTER TABLE "PasswordResetTokens" RENAME CONSTRAINT "PasswordResetToken_pkey" TO "PasswordResetTokens_pkey";

-- AlterTable
ALTER TABLE "Players" RENAME CONSTRAINT "Player_pkey" TO "Players_pkey";

-- AlterTable
ALTER TABLE "Sessions" RENAME CONSTRAINT "Session_pkey" TO "Sessions_pkey";

-- AlterTable
ALTER TABLE "SpyLocations" RENAME CONSTRAINT "SpyLocation_pkey" TO "SpyLocations_pkey";

-- AlterTable
ALTER TABLE "Users" RENAME CONSTRAINT "User_pkey" TO "Users_pkey";

-- CreateIndex
CREATE INDEX "Bots_userId_idx" ON "Bots"("userId");

-- CreateIndex
CREATE INDEX "Bots_botType_idx" ON "Bots"("botType");

-- RenameForeignKey
ALTER TABLE "Accounts" RENAME CONSTRAINT "Account_userId_fkey" TO "Accounts_userId_fkey";

-- RenameForeignKey
ALTER TABLE "FriendRequests" RENAME CONSTRAINT "FriendRequest_receiverId_fkey" TO "FriendRequests_receiverId_fkey";

-- RenameForeignKey
ALTER TABLE "FriendRequests" RENAME CONSTRAINT "FriendRequest_senderId_fkey" TO "FriendRequests_senderId_fkey";

-- RenameForeignKey
ALTER TABLE "Friendships" RENAME CONSTRAINT "Friendship_user1Id_fkey" TO "Friendships_user1Id_fkey";

-- RenameForeignKey
ALTER TABLE "Friendships" RENAME CONSTRAINT "Friendship_user2Id_fkey" TO "Friendships_user2Id_fkey";

-- RenameForeignKey
ALTER TABLE "Games" RENAME CONSTRAINT "Game_lobbyId_fkey" TO "Games_lobbyId_fkey";

-- RenameForeignKey
ALTER TABLE "Lobbies" RENAME CONSTRAINT "Lobby_creatorId_fkey" TO "Lobbies_creatorId_fkey";

-- RenameForeignKey
ALTER TABLE "Players" RENAME CONSTRAINT "Player_gameId_fkey" TO "Players_gameId_fkey";

-- RenameForeignKey
ALTER TABLE "Players" RENAME CONSTRAINT "Player_userId_fkey" TO "Players_userId_fkey";

-- RenameForeignKey
ALTER TABLE "Sessions" RENAME CONSTRAINT "Session_userId_fkey" TO "Sessions_userId_fkey";

-- RenameIndex
ALTER INDEX "Account_provider_providerAccountId_key" RENAME TO "Accounts_provider_providerAccountId_key";

-- RenameIndex
ALTER INDEX "EmailVerificationToken_token_idx" RENAME TO "EmailVerificationTokens_token_idx";

-- RenameIndex
ALTER INDEX "EmailVerificationToken_token_key" RENAME TO "EmailVerificationTokens_token_key";

-- RenameIndex
ALTER INDEX "EmailVerificationToken_userId_idx" RENAME TO "EmailVerificationTokens_userId_idx";

-- RenameIndex
ALTER INDEX "FriendRequest_createdAt_idx" RENAME TO "FriendRequests_createdAt_idx";

-- RenameIndex
ALTER INDEX "FriendRequest_receiverId_idx" RENAME TO "FriendRequests_receiverId_idx";

-- RenameIndex
ALTER INDEX "FriendRequest_senderId_idx" RENAME TO "FriendRequests_senderId_idx";

-- RenameIndex
ALTER INDEX "FriendRequest_senderId_receiverId_key" RENAME TO "FriendRequests_senderId_receiverId_key";

-- RenameIndex
ALTER INDEX "FriendRequest_status_idx" RENAME TO "FriendRequests_status_idx";

-- RenameIndex
ALTER INDEX "Friendship_createdAt_idx" RENAME TO "Friendships_createdAt_idx";

-- RenameIndex
ALTER INDEX "Friendship_user1Id_idx" RENAME TO "Friendships_user1Id_idx";

-- RenameIndex
ALTER INDEX "Friendship_user1Id_user2Id_key" RENAME TO "Friendships_user1Id_user2Id_key";

-- RenameIndex
ALTER INDEX "Friendship_user2Id_idx" RENAME TO "Friendships_user2Id_idx";

-- RenameIndex
ALTER INDEX "Game_createdAt_idx" RENAME TO "Games_createdAt_idx";

-- RenameIndex
ALTER INDEX "Game_lobbyId_idx" RENAME TO "Games_lobbyId_idx";

-- RenameIndex
ALTER INDEX "Game_status_idx" RENAME TO "Games_status_idx";

-- RenameIndex
ALTER INDEX "Lobby_code_key" RENAME TO "Lobbies_code_key";

-- RenameIndex
ALTER INDEX "Lobby_createdAt_idx" RENAME TO "Lobbies_createdAt_idx";

-- RenameIndex
ALTER INDEX "Lobby_creatorId_idx" RENAME TO "Lobbies_creatorId_idx";

-- RenameIndex
ALTER INDEX "Lobby_isActive_idx" RENAME TO "Lobbies_isActive_idx";

-- RenameIndex
ALTER INDEX "PasswordResetToken_token_idx" RENAME TO "PasswordResetTokens_token_idx";

-- RenameIndex
ALTER INDEX "PasswordResetToken_token_key" RENAME TO "PasswordResetTokens_token_key";

-- RenameIndex
ALTER INDEX "PasswordResetToken_userId_idx" RENAME TO "PasswordResetTokens_userId_idx";

-- RenameIndex
ALTER INDEX "Player_gameId_idx" RENAME TO "Players_gameId_idx";

-- RenameIndex
ALTER INDEX "Player_gameId_userId_key" RENAME TO "Players_gameId_userId_key";

-- RenameIndex
ALTER INDEX "Player_userId_idx" RENAME TO "Players_userId_idx";

-- RenameIndex
ALTER INDEX "Session_sessionToken_key" RENAME TO "Sessions_sessionToken_key";

-- RenameIndex
ALTER INDEX "SpyLocation_category_idx" RENAME TO "SpyLocations_category_idx";

-- RenameIndex
ALTER INDEX "SpyLocation_isActive_idx" RENAME TO "SpyLocations_isActive_idx";

-- RenameIndex
ALTER INDEX "SpyLocation_name_key" RENAME TO "SpyLocations_name_key";

-- RenameIndex
ALTER INDEX "User_email_key" RENAME TO "Users_email_key";

-- RenameIndex
ALTER INDEX "User_friendCode_key" RENAME TO "Users_friendCode_key";

-- RenameIndex
ALTER INDEX "User_isGuest_lastActiveAt_idx" RENAME TO "Users_isGuest_lastActiveAt_idx";

-- RenameIndex
ALTER INDEX "User_username_key" RENAME TO "Users_username_key";

-- RenameIndex
ALTER INDEX "VerificationToken_identifier_token_key" RENAME TO "VerificationTokens_identifier_token_key";

-- RenameIndex
ALTER INDEX "VerificationToken_token_key" RENAME TO "VerificationTokens_token_key";

