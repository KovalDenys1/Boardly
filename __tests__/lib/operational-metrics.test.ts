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

  it('keeps the earlier rules in place', async () => {
    const evaluation = await evaluateReliabilityAlerts()

    expect(evaluation.rules.map((rule) => rule.alertKey)).toEqual([
      'rejoin_timeout',
      'auth_refresh_failed',
      'move_apply_timeout',
      'discord_bot_stale',
      'site_silent',
    ])
  })
})

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function hoursAgo(hours) {
    return new Date(Date.now() - hours * HOUR_MS)
}

/**
 * `count` human events inside the window-length slot that ended `dayOffset` days ago,
 * i.e. the same hours of the day as the window currently under test.
 */
function humanEventsInSlot(dayOffset, count) {
    const slotEnd = Date.now() - dayOffset * DAY_MS
    return Array.from({ length: count }, (_, index) => ({
        eventName: 'move_submit_applied',
        gameType: 'connect_four',
        latencyMs: 120,
        success: true,
        applied: true,
        // Spread across the slot but never on its closing edge, which is exclusive.
        occurredAt: new Date(slotEnd - HOUR_MS - index * 60 * 1000),
    }))
}

async function siteSilentRule() {
    const evaluation = await evaluateReliabilityAlerts()
    const rule = evaluation.rules.find((candidate) => candidate.alertKey === 'site_silent')
    expect(rule).toBeDefined()
    return rule
}

describe('evaluateReliabilityAlerts – site_silent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockPrisma.operationalEvents.findFirst.mockResolvedValue({ occurredAt: minutesAgo(3) })
    })

    it('fires when the site goes quiet in hours that are normally busy', async () => {
        // Six ordinary days behind a silent one - 19 September, in miniature.
        const baseline = [1, 2, 3, 4, 5, 6].flatMap((day) => humanEventsInSlot(day, 8))
        mockPrisma.operationalEvents.findMany.mockResolvedValue(baseline)

        const rule = await siteSilentRule()

        expect(rule.breached).toBe(true)
        expect(rule.severity).toBe('critical')
        expect(rule.currentValue).toBe(0)
        expect(rule.baselineValue).toBe(8)
    })

    it('stays quiet at an hour that is always quiet', async () => {
        // Nothing on any of the prior days either: this is 04:00, not an outage.
        mockPrisma.operationalEvents.findMany.mockResolvedValue([])

        const rule = await siteSilentRule()

        expect(rule.breached).toBe(false)
        expect(rule.baselineValue).toBe(0)
    })

    it('still fires on the second day of an outage, when a mean would have given up', async () => {
        // Day 1 is already dead. A mean of [0,8,8,8,8,8] is 6.7 and falling; by day three
        // it would drop under the threshold and switch the alarm off mid-outage.
        const baseline = [2, 3, 4, 5, 6].flatMap((day) => humanEventsInSlot(day, 8))
        mockPrisma.operationalEvents.findMany.mockResolvedValue(baseline)

        const rule = await siteSilentRule()

        expect(rule.breached).toBe(true)
        expect(rule.baselineValue).toBe(8)
    })

    it('keeps firing on day four, when a median of the prior days would have given up', async () => {
        // Three of the six comparison days are already dead. Their median is 4, under the
        // threshold, so a median baseline would stop breaching here and post a recovery
        // in the middle of the outage. The 75th percentile still reads the live days.
        const baseline = [4, 5, 6].flatMap((day) => humanEventsInSlot(day, 8))
        mockPrisma.operationalEvents.findMany.mockResolvedValue(baseline)

        const rule = await siteSilentRule()

        expect(rule.breached).toBe(true)
        expect(rule.baselineValue).toBe(8)
    })

    it('does not fire while people are still playing', async () => {
        const baseline = [1, 2, 3, 4, 5, 6].flatMap((day) => humanEventsInSlot(day, 8))
        const live = humanEventsInSlot(0, 4)
        mockPrisma.operationalEvents.findMany.mockResolvedValue([...baseline, ...live])

        const rule = await siteSilentRule()

        expect(rule.breached).toBe(false)
        expect(rule.currentValue).toBe(4)
    })

    it('counts every kind of event a human has to be present to produce', async () => {
        const baseline = [1, 2, 3, 4, 5, 6].flatMap((day) => humanEventsInSlot(day, 8))
        const live = ['lobby_create_ready', 'invite_opened', 'second_human_joined', 'signup_prompt_shown'].map(
            (eventName) => ({
                eventName,
                gameType: null,
                latencyMs: null,
                success: null,
                applied: null,
                occurredAt: hoursAgo(1),
            })
        )
        mockPrisma.operationalEvents.findMany.mockResolvedValue([...baseline, ...live])

        const rule = await siteSilentRule()

        expect(rule.currentValue).toBe(4)
        expect(rule.breached).toBe(false)
    })
})
