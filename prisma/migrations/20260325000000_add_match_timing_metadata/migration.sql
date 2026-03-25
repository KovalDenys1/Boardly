-- AddColumn: startedAt, endedAt, durationSeconds, terminalMetadata to Games
-- All columns are nullable for full backwards compatibility with existing rows.

ALTER TABLE "Games" ADD COLUMN "startedAt" TIMESTAMPTZ(3);
ALTER TABLE "Games" ADD COLUMN "endedAt" TIMESTAMPTZ(3);
ALTER TABLE "Games" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "Games" ADD COLUMN "terminalMetadata" JSONB;

-- Indexes for time-range queries and analytics
CREATE INDEX "Games_startedAt_idx" ON "Games"("startedAt");
CREATE INDEX "Games_endedAt_idx" ON "Games"("endedAt");
