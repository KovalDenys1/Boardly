import { botDelay, resolveBotUxDelayMs } from '@/lib/bots/core/bot-ux-timing'

describe('resolveBotUxDelayMs', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BOT_UX_DELAY_MS
    delete process.env.BOT_UX_DELAY_SCALE
    delete process.env.BOT_UX_DELAY_MIN_MS
    delete process.env.BOT_UX_DELAY_MAX_MS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('uses default delays with difficulty scaling', () => {
    expect(resolveBotUxDelayMs('easy', 300)).toBe(518)
    expect(resolveBotUxDelayMs('medium', 300)).toBe(450)
    expect(resolveBotUxDelayMs('hard', 300)).toBe(383)
  })

  it('supports fixed delay override', () => {
    process.env.BOT_UX_DELAY_MS = '220'

    expect(resolveBotUxDelayMs('easy', 300)).toBe(220)
    expect(resolveBotUxDelayMs('hard', 120)).toBe(220)
  })

  it('clamps delays to configured bounds', () => {
    process.env.BOT_UX_DELAY_MS = '900'
    process.env.BOT_UX_DELAY_MIN_MS = '50'
    process.env.BOT_UX_DELAY_MAX_MS = '300'

    expect(resolveBotUxDelayMs('medium', 300)).toBe(300)
  })

  it('swaps min/max bounds when configured in reverse order', () => {
    process.env.BOT_UX_DELAY_SCALE = '0'
    process.env.BOT_UX_DELAY_MIN_MS = '140'
    process.env.BOT_UX_DELAY_MAX_MS = '80'

    expect(resolveBotUxDelayMs('medium', 300)).toBe(80)
  })
})

describe('botDelay', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('waits only what is left of the pause after the bot has already spent time thinking', async () => {
    let done = false
    // 200 base is 300 ms at medium; 100 ms of it are already gone.
    void botDelay('medium', 200, 100).then(() => { done = true })
    await jest.advanceTimersByTimeAsync(199)
    expect(done).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('does not wait at all when the thinking outlasted the pause', async () => {
    const spy = jest.spyOn(global, 'setTimeout')
    await botDelay('hard', 150, 5_000)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
