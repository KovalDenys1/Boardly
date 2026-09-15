// @ts-nocheck

import { evaluateReliabilityAlerts } from '@/lib/operational-metrics'
import { prisma } from '@/lib/db'

// lib/analytics pulls @vercel/analytics (ESM) in; the rule under test only needs its two targets.
jest.mock('@/lib/analytics', () => ({
  LOBBY_READY_TARGET_MS: 1500,
  MOVE_APPLY_TARGET_MS: 800,
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    operationalEvents: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000)
}

async function discordBotStaleRule() {
  const evaluation = await evaluateReliabilityAlerts()
  const rule = evaluation.rules.find((candidate) => candidate.alertKey === 'discord_bot_stale')
  expect(rule).toBeDefined()
  return rule
}

describe('evaluateReliabilityAlerts – discord_bot_stale', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.operationalEvents.findMany.mockResolvedValue([])
    mockPrisma.operationalEvents.findFirst.mockResolvedValue(null)
  })

  it('reads the newest discord-bot cron_run row', async () => {
    await discordBotStaleRule()

    expect(mockPrisma.operationalEvents.findFirst).toHaveBeenCalledWith({
      where: { eventName: 'cron_run', source: 'discord-bot' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    })
  })

  it('is quiet on a fresh heartbeat', async () => {
    mockPrisma.operationalEvents.findFirst.mockResolvedValue({ occurredAt: minutesAgo(3) })

    const rule = await discordBotStaleRule()

    expect(rule.breached).toBe(false)
    expect(rule.severity).toBe('warning')
    expect(rule.unit).toBe('minutes')
    expect(rule.currentValue).toBeGreaterThanOrEqual(3)
    expect(rule.currentValue).toBeLessThan(4)
    expect(rule.runbookPath).toBe('docs/OPERATIONS.md#runbook-discord_bot_stale')
  })

  it('warns after 20 minutes of silence', async () => {
    mockPrisma.operationalEvents.findFirst.mockResolvedValue({ occurredAt: minutesAgo(25) })

    const rule = await discordBotStaleRule()

    expect(rule.breached).toBe(true)
    expect(rule.severity).toBe('warning')
    expect(rule.thresholdValue).toBe(20)
    expect(rule.summary).toContain('last heartbeat 25.0m ago')
  })

  it('goes critical after 60 minutes of silence', async () => {
    mockPrisma.operationalEvents.findFirst.mockResolvedValue({ occurredAt: minutesAgo(90) })

    const rule = await discordBotStaleRule()

    expect(rule.breached).toBe(true)
    expect(rule.severity).toBe('critical')
    expect(rule.thresholdValue).toBe(60)
  })

  it('does not alert before the first heartbeat ever lands', async () => {
    const rule = await discordBotStaleRule()

    expect(rule.breached).toBe(false)
    expect(rule.currentValue).toBeNull()
    expect(rule.summary).toContain('never sent a heartbeat')
  })

  it('survives a database without the OperationalEvents table', async () => {
    const missingTable = Object.assign(new Error('table missing'), {
      code: 'P2021',
      meta: { table: 'public.OperationalEvents' },
    })
    mockPrisma.operationalEvents.findMany.mockRejectedValue(missingTable)
    mockPrisma.operationalEvents.findFirst.mockRejectedValue(missingTable)

    const rule = await discordBotStaleRule()

    expect(rule.breached).toBe(false)
  })

  it('keeps the three original rules in place', async () => {
    const evaluation = await evaluateReliabilityAlerts()

    expect(evaluation.rules.map((rule) => rule.alertKey)).toEqual([
      'rejoin_timeout',
      'auth_refresh_failed',
      'move_apply_timeout',
      'discord_bot_stale',
    ])
  })
})
