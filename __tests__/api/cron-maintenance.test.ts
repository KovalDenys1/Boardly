/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest, NextResponse } from 'next/server'
import { GET } from '@/app/api/cron/maintenance/route'
import { warnUnverifiedAccounts, cleanupUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'
import { cleanupOldReplaySnapshots, cleanupOversizedReplaySnapshots } from '@/lib/cleanup-replays'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { enforceRetention } from '@/lib/data-retention'
import { recordCronRun } from '@/lib/cron-heartbeat'

jest.mock('@/lib/cleanup-unverified', () => ({
  warnUnverifiedAccounts: jest.fn(),
  cleanupUnverifiedAccounts: jest.fn(),
}))

jest.mock('@/scripts/cleanup-old-guests', () => ({
  cleanupOldGuests: jest.fn(),
}))

jest.mock('@/lib/cleanup-replays', () => ({
  cleanupOldReplaySnapshots: jest.fn(),
  cleanupOversizedReplaySnapshots: jest.fn(),
}))

jest.mock('@/lib/lobby-health', () => ({
  cleanupStaleLobbiesAndGames: jest.fn(),
}))

jest.mock('@/lib/data-retention', () => ({
  enforceRetention: jest.fn(),
}))

jest.mock('@/lib/cron-heartbeat', () => ({
  recordCronRun: jest.fn(),
}))

jest.mock('@/lib/cron-auth', () => ({
  authorizeCronRequest: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockWarnUnverifiedAccounts = warnUnverifiedAccounts as jest.MockedFunction<typeof warnUnverifiedAccounts>
const mockCleanupUnverifiedAccounts = cleanupUnverifiedAccounts as jest.MockedFunction<
  typeof cleanupUnverifiedAccounts
>
const mockCleanupOldGuests = cleanupOldGuests as jest.MockedFunction<typeof cleanupOldGuests>
const mockCleanupOldReplaySnapshots = cleanupOldReplaySnapshots as jest.MockedFunction<
  typeof cleanupOldReplaySnapshots
>
const mockCleanupOversizedReplaySnapshots = cleanupOversizedReplaySnapshots as jest.MockedFunction<
  typeof cleanupOversizedReplaySnapshots
>
const mockCleanupStaleLobbiesAndGames = cleanupStaleLobbiesAndGames as jest.MockedFunction<
  typeof cleanupStaleLobbiesAndGames
>
const mockAuthorizeCronRequest = authorizeCronRequest as jest.MockedFunction<typeof authorizeCronRequest>

describe('GET /api/cron/maintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthorizeCronRequest.mockReturnValue(null)
  })

  it('returns auth error when cron request is unauthorized', async () => {
    mockAuthorizeCronRequest.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET(new NextRequest('http://localhost:3000/api/cron/maintenance'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
  })

  it('returns accurate cleanup counters on success', async () => {
    mockWarnUnverifiedAccounts.mockResolvedValue({ warned: 3 })
    mockCleanupUnverifiedAccounts.mockResolvedValue({ deleted: 2 })
    mockCleanupOldGuests.mockResolvedValue({ deleted: 4 })
    mockCleanupOldReplaySnapshots.mockResolvedValue({
      deleted: 5,
      retentionDays: 90,
      cutoffDate: '2026-01-01T00:00:00.000Z',
    })
    mockCleanupOversizedReplaySnapshots.mockResolvedValue({
      deletedSnapshots: 12,
      affectedGames: 2,
    })
    enforceRetention.mockResolvedValue({
      feedback: { days: 365, cutoff: 'c', enforced: true, matched: 2, deleted: 2 },
      operationalEvents: { days: 180, cutoff: 'c', enforced: false, matched: 9, deleted: 0 },
    })
    mockCleanupStaleLobbiesAndGames.mockResolvedValue({
      deactivatedLobbies: 6,
      cancelledWaitingGames: 7,
      abandonedPlayingGames: 8,
      scannedLobbies: 10,
      scannedActiveGames: 11,
    })

    const response = await GET(new NextRequest('http://localhost:3000/api/cron/maintenance'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.warned).toBe(3)
    expect(payload.deletedUnverified).toBe(2)
    expect(payload.deletedGuests).toBe(4)
    expect(payload.deletedReplaySnapshots).toBe(5)
    expect(payload.deactivatedLobbies).toBe(6)
    expect(payload.cancelledWaitingGames).toBe(7)
    expect(payload.abandonedPlayingGames).toBe(8)
    expect(payload.replayRetentionDays).toBe(90)
    expect(payload.replayCutoffDate).toBe('2026-01-01T00:00:00.000Z')
    expect(payload.deletedOversizedReplaySnapshots).toBe(12)
    expect(payload.oversizedReplayGames).toBe(2)
    expect(payload.timestamp).toEqual(expect.any(String))

    expect(mockCleanupOldGuests).toHaveBeenCalledWith({ disconnect: false })

    // #1130: the retention run is reported in full, and a report-only rule leaves the
    // count it would have deleted in the heartbeat payload.
    expect(enforceRetention).toHaveBeenCalledTimes(1)
    expect(payload.retention.feedback.deleted).toBe(2)
    const heartbeat = recordCronRun.mock.calls[0][0].payload
    expect(heartbeat.retention_feedback_enforced).toBe(true)
    expect(heartbeat.retention_feedback_deleted).toBe(2)
    expect(heartbeat.retention_operationalEvents_enforced).toBe(false)
    expect(heartbeat.retention_operationalEvents_matched).toBe(9)
  })
})
