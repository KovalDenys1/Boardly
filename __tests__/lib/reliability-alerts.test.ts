// @ts-nocheck

import { runReliabilityAlertCycle } from '@/lib/reliability-alerts'
import { prisma } from '@/lib/db'
import { evaluateReliabilityAlerts } from '@/lib/operational-metrics'

jest.mock('@/lib/db', () => ({
  prisma: {
    operationalAlertStates: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/operational-metrics', () => ({
  evaluateReliabilityAlerts: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockEvaluateReliabilityAlerts =
  evaluateReliabilityAlerts as jest.MockedFunction<typeof evaluateReliabilityAlerts>

function breachedRule(overrides = {}) {
  return {
    alertKey: 'rejoin_timeout',
    breached: true,
    severity: 'critical',
    currentValue: 3,
    thresholdValue: 2,
    baselineValue: 0,
    unit: 'count',
    summary: 'Reconnect timeouts breached',
    windowMinutes: 10,
    runbookPath: '/docs/REALTIME_TELEMETRY.md#rejoin_timeout',
    ...overrides,
  }
}

describe('runReliabilityAlertCycle', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    mockPrisma.operationalAlertStates.findMany.mockResolvedValue([])
    mockPrisma.operationalAlertStates.upsert.mockResolvedValue({ id: 'state-1' })
    mockPrisma.operationalAlertStates.update.mockResolvedValue({ id: 'state-1' })
    mockEvaluateReliabilityAlerts.mockResolvedValue({
      generatedAt: '2026-04-22T12:00:00.000Z',
      windowMinutes: 10,
      baselineDays: 7,
      rules: [breachedRule()],
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('falls back when githubIssueNumber column is missing', async () => {
    const missingColumnError = Object.assign(
      new Error(
        'Invalid `prisma.operationalAlertStates.findMany()` invocation: The column `(not available)` does not exist in the current database.'
      ),
      {
        code: 'P2022',
        meta: {
          modelName: 'OperationalAlertStates',
          column: 'githubIssueNumber',
        },
      }
    )

    mockPrisma.operationalAlertStates.findMany
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce([])

    const result = await runReliabilityAlertCycle({
      githubToken: 'github-token',
      githubRepo: 'owner/repo',
    })

    expect(result.triggered.map((rule) => rule.alertKey)).toEqual(['rejoin_timeout'])
    expect(mockPrisma.operationalAlertStates.findMany).toHaveBeenCalledTimes(2)
    expect(mockPrisma.operationalAlertStates.findMany.mock.calls[0][0].select).toHaveProperty(
      'githubIssueNumber',
      true
    )
    expect(mockPrisma.operationalAlertStates.findMany.mock.calls[1][0].select).not.toHaveProperty(
      'githubIssueNumber'
    )
    expect(global.fetch).not.toHaveBeenCalled()

    const upsertArgs = mockPrisma.operationalAlertStates.upsert.mock.calls[0][0]
    expect(upsertArgs.create).not.toHaveProperty('githubIssueNumber')
    expect(upsertArgs.update).not.toHaveProperty('githubIssueNumber')
  })

  it('creates and persists a GitHub issue number when the column is available', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ number: 123 }),
    })

    await runReliabilityAlertCycle({
      githubToken: 'github-token',
      githubRepo: 'owner/repo',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues',
      expect.objectContaining({ method: 'POST' })
    )

    const upsertArgs = mockPrisma.operationalAlertStates.upsert.mock.calls[0][0]
    expect(upsertArgs.create.githubIssueNumber).toBe(123)
    expect(upsertArgs.update.githubIssueNumber).toBe(123)
  })
})
