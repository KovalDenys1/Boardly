-- ============================================================================
-- Migration: hashed auth tokens and a purpose column
-- Date: 2026-09-25
-- Description:
--   #1141 (audit S1-09). Reset, verification and deletion tokens were stored
--   as the raw value that goes into the emailed link, so a read of either
--   table was a working link for the token's lifetime. New rows store
--   sha256(token) in "tokenHash" and leave "token" NULL (lib/auth-tokens.ts).
--
--   Deletion tokens shared PasswordResetTokens through a 'DELETE_' prefix that
--   the reset route never checked. New rows say what they are for in
--   "purpose"; the reset and delete routes each accept only their own.
--
--   Additive, and no existing row changes:
--   - "token" loses NOT NULL; rows issued before this keep their raw value
--     and the routes still accept them until they expire (1 h for reset and
--     deletion, 24-48 h for verification), so no link in flight stops working.
--   - "purpose" defaults to 'reset' for every existing row. A pre-change
--     deletion row keeps its 'DELETE_' prefix, and the code reads the prefix
--     for those rows, so no UPDATE is needed here (production had 0 reset or
--     deletion rows and 10 unexpired verification rows on 2026-09-25).
--   - The code on main keeps working against this schema until the release:
--     it writes "token" and reads by "token", both still there.
--   Grants: none; both tables have no anon/authenticated privilege since
--   20260924141000 and new columns inherit that.
-- ============================================================================

-- CreateEnum
CREATE TYPE "PasswordResetTokenPurpose" AS ENUM ('reset', 'delete');

-- AlterTable
ALTER TABLE "PasswordResetTokens" ADD COLUMN     "purpose" "PasswordResetTokenPurpose" NOT NULL DEFAULT 'reset',
ADD COLUMN     "tokenHash" TEXT,
ALTER COLUMN "token" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmailVerificationTokens" ADD COLUMN     "tokenHash" TEXT,
ALTER COLUMN "token" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetTokens_tokenHash_key" ON "PasswordResetTokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationTokens_tokenHash_key" ON "EmailVerificationTokens"("tokenHash");
