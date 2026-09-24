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
    users: {
      count: jest.fn(async () => 0),
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
      'guests_minted_per_hour',
      'rate_limiter_degraded',
      'email_send_failed',
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

describe('evaluateReliabilityAlerts – abuse rules (#1150)', () => {
  async function rule(alertKey) {
    const evaluation = await evaluateReliabilityAlerts()
    const found = evaluation.rules.find((candidate) => candidate.alertKey === alertKey)
    expect(found).toBeDefined()
    return found
  }

  function serverEvent(eventName, minutes) {
    return {
      eventName,
      gameType: null,
      latencyMs: null,
      success: false,
      applied: null,
      occurredAt: minutesAgo(minutes),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.operationalEvents.findMany.mockResolvedValue([])
    mockPrisma.operationalEvents.findFirst.mockResolvedValue(null)
    mockPrisma.users.count.mockResolvedValue(0)
  })

  it('guests_minted_per_hour breaches on a seeded burst of 500 guest creations', async () => {
    // First call: the last hour. Second: the 48 hours before it.
    mockPrisma.users.count.mockResolvedValueOnce(500).mockResolvedValueOnce(30)

    const found = await rule('guests_minted_per_hour')

    expect(found.breached).toBe(true)
    expect(found.currentValue).toBe(500)
    expect(found.thresholdValue).toBe(60)
    expect(found.runbookPath).toBe('docs/OPERATIONS.md#runbook-guests_minted_per_hour')
    expect(mockPrisma.users.count).toHaveBeenCalledWith({
      where: { isGuest: true, createdAt: expect.objectContaining({ gte: expect.any(Date) }) },
    })
  })

  it('guests_minted_per_hour stays quiet on an ordinary hour', async () => {
    mockPrisma.users.count.mockResolvedValueOnce(4).mockResolvedValueOnce(30)

    expect((await rule('guests_minted_per_hour')).breached).toBe(false)
  })

  it('guests_minted_per_hour scales its threshold with a busy baseline', async () => {
    // 48 h at 20 an hour: the threshold is 200, not the floor of 60.
    mockPrisma.users.count.mockResolvedValueOnce(150).mockResolvedValueOnce(960)

    const found = await rule('guests_minted_per_hour')

    expect(found.breached).toBe(false)
    expect(found.thresholdValue).toBe(200)
  })

  it('rate_limiter_degraded fires on the first degraded event in the window', async () => {
    mockPrisma.operationalEvents.findMany.mockResolvedValue([serverEvent('rate_limiter_degraded', 3)])

    const found = await rule('rate_limiter_degraded')

    expect(found.breached).toBe(true)
    expect(found.severity).toBe('critical')
    expect(found.runbookPath).toBe('docs/OPERATIONS.md#runbook-rate_limiter_degraded')
  })

  it('rate_limiter_degraded ignores an outage that ended before the window', async () => {
    mockPrisma.operationalEvents.findMany.mockResolvedValue([serverEvent('rate_limiter_degraded', 90)])

    expect((await rule('rate_limiter_degraded')).breached).toBe(false)
  })

  it('email_send_failed fires on three failures in the window, not on one', async () => {
    mockPrisma.operationalEvents.findMany.mockResolvedValue([serverEvent('email_send_failed', 2)])
    expect((await rule('email_send_failed')).breached).toBe(false)

    mockPrisma.operationalEvents.findMany.mockResolvedValue([
      serverEvent('email_send_failed', 2),
      serverEvent('email_send_failed', 4),
      serverEvent('email_send_failed', 6),
    ])
    const found = await rule('email_send_failed')
    expect(found.breached).toBe(true)
    expect(found.severity).toBe('warning')
    expect(found.runbookPath).toBe('docs/OPERATIONS.md#runbook-email_send_failed')
  })

  it('email_send_failed goes critical when the daily mail budget is reached', async () => {
    mockPrisma.operationalEvents.findMany.mockResolvedValue([serverEvent('email_send_budget_reached', 1)])

    const found = await rule('email_send_failed')

    expect(found.breached).toBe(true)
    expect(found.severity).toBe('critical')
    expect(found.summary).toContain('daily transactional mail budget')
  })

  it('asks the database for the server-only events', async () => {
    await evaluateReliabilityAlerts()

    const names = mockPrisma.operationalEvents.findMany.mock.calls[0][0].where.eventName.in
    expect(names).toEqual(
      expect.arrayContaining(['rate_limiter_degraded', 'email_send_failed', 'email_send_budget_reached'])
    )
  })
})

