import { resolveBotUxDelayMs } from '@/lib/bots/core/bot-ux-timing'

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

  it('uses short default delays with difficulty scaling', () => {
    expect(resolveBotUxDelayMs('easy', 300)).toBe(190)
    expect(resolveBotUxDelayMs('medium', 300)).toBe(165)
    expect(resolveBotUxDelayMs('hard', 300)).toBe(140)
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
