-- ============================================================================
-- Migration: operational observability tables
-- Date: 2026-02-21
-- Description:
--   Add persistent storage for operational telemetry events and alert state.
-- ============================================================================

CREATE TABLE "OperationalEvents" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "gameType" TEXT,
    "isGuest" BOOLEAN,
    "success" BOOLEAN,
    "applied" BOOLEAN,
    "latencyMs" INTEGER,
    "targetMs" INTEGER,
    "attemptsTotal" INTEGER,
    "reason" TEXT,
    "stage" TEXT,
    "statusCode" INTEGER,
    "source" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalAlertStates" (
    "id" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "lastValue" DOUBLE PRECISION,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "lastResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlertStates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAlertStates_alertKey_key" ON "OperationalAlertStates"("alertKey");
CREATE INDEX "OperationalEvents_eventName_occurredAt_idx" ON "OperationalEvents"("eventName", "occurredAt");
CREATE INDEX "OperationalEvents_metricType_occurredAt_idx" ON "OperationalEvents"("metricType", "occurredAt");
CREATE INDEX "OperationalEvents_gameType_occurredAt_idx" ON "OperationalEvents"("gameType", "occurredAt");
