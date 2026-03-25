-- RemoveEnumValues: chess and uno from GameType
-- Reassign any existing rows (should be zero, but safe for any legacy data)
UPDATE "Games" SET "gameType" = 'other' WHERE "gameType" IN ('chess', 'uno');

-- Drop default before altering column type (required by PostgreSQL)
ALTER TABLE "Games" ALTER COLUMN "gameType" DROP DEFAULT;

-- PostgreSQL does not support DROP VALUE from enum directly.
-- Standard approach: create new enum, alter column, swap.
CREATE TYPE "GameType_new" AS ENUM (
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
  'guess_the_spy',
  'telephone_doodle',
  'sketch_and_guess',
  'liars_party',
  'fake_artist',
  'other'
);

ALTER TABLE "Games"
  ALTER COLUMN "gameType" TYPE "GameType_new"
  USING "gameType"::text::"GameType_new";

-- Restore default with new type
ALTER TABLE "Games"
  ALTER COLUMN "gameType" SET DEFAULT 'yahtzee'::"GameType_new";

DROP TYPE "GameType";
ALTER TYPE "GameType_new" RENAME TO "GameType";
