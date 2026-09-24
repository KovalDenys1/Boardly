const recordServerReliabilityEvent = jest.fn(async () => undefined)

jest.mock('@/lib/server-operational-events', () => ({ recordServerReliabilityEvent }))
jest.mock('@/lib/redis-credentials', () => ({ getRedisRestCredentials: () => null }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }))

import {
  __emailSendGuardTestUtils,
  DEFAULT_MAIL_DAILY_BUDGET,
  MAIL_ADDRESS_DAILY_MAX,
  reserveTransactionalMailSend,
} from '@/lib/email-send-guard'

const DAY = new Date('2026-09-24T08:00:00.000Z').getTime()
const minutes = (n: number) => new Date(DAY + n * 60 * 1000)

describe('reserveTransactionalMailSend (#1158)', () => {
  const originalBudget = process.env.EMAIL_DAILY_SEND_BUDGET

  beforeEach(() => {
    __emailSendGuardTestUtils.reset()
    recordServerReliabilityEvent.mockClear()
    delete process.env.EMAIL_DAILY_SEND_BUDGET
  })

  afterAll(() => {
    if (originalBudget === undefined) delete process.env.EMAIL_DAILY_SEND_BUDGET
    else process.env.EMAIL_DAILY_SEND_BUDGET = originalBudget
  })

  it('allows one mail per address per 10 minutes', async () => {
    expect(await reserveTransactionalMailSend('password_reset', 'a@example.com', minutes(0))).toEqual({ allowed: true })
    expect(await reserveTransactionalMailSend('password_reset', 'A@example.com ', minutes(5))).toEqual({
      allowed: false,
      reason: 'address_cooldown',
    })
  })

  it('refuses the fourth mail to one address in a day, however it is spaced', async () => {
    const results = []
    for (let i = 0; i < 4; i += 1) {
      results.push(await reserveTransactionalMailSend('password_reset', 'b@example.com', minutes(i * 15)))
    }
    expect(results.slice(0, MAIL_ADDRESS_DAILY_MAX).every((result) => result.allowed)).toBe(true)
    expect(results[3]).toEqual({ allowed: false, reason: 'address_daily_cap' })
  })

  it('keeps each kind on its own per-address counters', async () => {
    expect((await reserveTransactionalMailSend('password_reset', 'c@example.com', minutes(0))).allowed).toBe(true)
    expect((await reserveTransactionalMailSend('verification', 'c@example.com', minutes(0))).allowed).toBe(true)
  })

  it('caps a burst of 150 registrations at the daily budget and records it once', async () => {
    let allowed = 0
    for (let i = 0; i < 150; i += 1) {
      const result = await reserveTransactionalMailSend('verification', `user+${i}@example.com`, minutes(i / 10))
      if (result.allowed) allowed += 1
    }
    expect(allowed).toBe(DEFAULT_MAIL_DAILY_BUDGET)
    expect(recordServerReliabilityEvent).toHaveBeenCalledTimes(1)
    expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'email_send_budget_reached', source: 'verification' })
    )
  })

  it('reads the budget from EMAIL_DAILY_SEND_BUDGET', async () => {
    process.env.EMAIL_DAILY_SEND_BUDGET = '2'
    const results = []
    for (let i = 0; i < 3; i += 1) {
      results.push(await reserveTransactionalMailSend('verification', `d${i}@example.com`, minutes(0)))
    }
    expect(results.map((result) => result.allowed)).toEqual([true, true, false])
  })

  it('starts a new budget on the next UTC day', async () => {
    process.env.EMAIL_DAILY_SEND_BUDGET = '1'
    expect((await reserveTransactionalMailSend('verification', 'e1@example.com', minutes(0))).allowed).toBe(true)
    expect((await reserveTransactionalMailSend('verification', 'e2@example.com', minutes(1))).allowed).toBe(false)
    expect((await reserveTransactionalMailSend('verification', 'e3@example.com', minutes(24 * 60))).allowed).toBe(true)
  })
})
