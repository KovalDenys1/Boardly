/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkBotId } from 'botid/server'
import { __botProtectionTestUtils, BOTID_TIMEOUT_MS, checkBot, refuseIfBot } from '@/lib/bot-protection'
import { BOTID_CHECK_LEVEL, BOTID_PROTECTED_ROUTES } from '@/lib/botid-routes'
import { recordServerReliabilityEvent } from '@/lib/server-operational-events'
import { browserFamily, deviceClass } from '@/lib/user-agent-class'

const mockLogError = jest.fn()
const mockLogWarn = jest.fn()

jest.mock('botid/server', () => ({ checkBotId: jest.fn() }))
jest.mock('@/lib/server-operational-events', () => ({ recordServerReliabilityEvent: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLogWarn(...args),
    error: (...args: unknown[]) => mockLogError(...args),
  })),
}))

const mockCheckBotId = checkBotId as jest.MockedFunction<typeof checkBotId>

function browserPost() {
  return new Request('https://boardly.online/api/auth/register', { method: 'POST' })
}

function verdict(isBot: boolean) {
  return { isBot, isHuman: !isBot, isVerifiedBot: false, bypassed: false }
}

/** BotID's own matcher (botid/dist/client/core): `*` spans any number of segments. */
function botIdPathMatches(pattern: string, pathname: string): boolean {
  const source = pattern.replace(/[.?+^$[\]\\(){}|-]/g, '\\$&').split('*').join('.*')
  return new RegExp(`^${source}$`).test(pathname)
}

describe('refuseIfBot (#1157)', () => {
  const originalVercelEnv = process.env.VERCEL_ENV

  beforeEach(() => {
    jest.clearAllMocks()
    __botProtectionTestUtils.reset()
    mockCheckBotId.mockResolvedValue(verdict(false))
  })

  afterAll(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = originalVercelEnv
  })

  it.each([
    ['unset (next start, CI, jest)', undefined],
    ['development (a pulled local env)', 'development'],
  ])('does not ask BotID outside a deployment: VERCEL_ENV %s', async (_label, value) => {
    if (value === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = value
    mockCheckBotId.mockResolvedValue(verdict(true))

    expect(await refuseIfBot('POST /api/auth/register', browserPost())).toBeNull()
    expect(mockCheckBotId).not.toHaveBeenCalled()
  })

  it.each(['production', 'preview'])('checks at the Basic level on %s', async (env) => {
    process.env.VERCEL_ENV = env

    expect(await refuseIfBot('POST /api/auth/register', browserPost())).toBeNull()
    expect(mockCheckBotId).toHaveBeenCalledWith({ advancedOptions: { checkLevel: 'basic' } })
  })

  it('answers 403 with a code the client translates when BotID says bot', async () => {
    process.env.VERCEL_ENV = 'production'
    mockCheckBotId.mockResolvedValue(verdict(true))

    const response = await refuseIfBot('POST /api/auth/guest-session', browserPost())

    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({
      code: 'BOT_CHECK_FAILED',
      translationKey: 'errors.botCheckFailed',
    })
  })

  it('lets a bot verdict through in monitor mode (BOTID_MODE=monitor), and logs it', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.BOTID_MODE = 'monitor'
    mockCheckBotId.mockResolvedValue(verdict(true))
    try {
      expect(await refuseIfBot('POST /api/auth/guest-session', browserPost())).toBeNull()
    } finally {
      delete process.env.BOTID_MODE
    }
  })

  describe('the botid_flagged event in monitor mode', () => {
    function request(headers: Record<string, string>) {
      return new Request('https://boardly.online/api/auth/register', { method: 'POST', headers })
    }

    beforeEach(() => {
      process.env.VERCEL_ENV = 'production'
      process.env.BOTID_MODE = 'monitor'
    })

    afterEach(() => {
      delete process.env.BOTID_MODE
    })

    it('records a register call as minting no guest, with the verdict BotID gave', async () => {
      mockCheckBotId.mockResolvedValue({
        isBot: true,
        isHuman: false,
        isVerifiedBot: true,
        verifiedBotName: 'googlebot',
        verifiedBotCategory: 'search_engine_crawler',
        bypassed: false,
        classificationReason: 'known crawler',
      })

      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      expect(
        await refuseIfBot('POST /api/auth/register', request({ 'user-agent': ua, 'x-vercel-ip-country': 'us' }))
      ).toBeNull()

      expect(recordServerReliabilityEvent).toHaveBeenCalledWith({
        eventName: 'botid_flagged',
        source: 'POST /api/auth/register',
        reason: 'verified bot',
        payload: {
          route: 'POST /api/auth/register',
          challengeHeaders: 'none',
          isBot: true,
          isVerifiedBot: true,
          verifiedBotName: 'googlebot',
          verifiedBotCategory: 'search_engine_crawler',
          bypassed: false,
          classificationReason: 'known crawler',
          mintedGuest: false,
          country: 'US',
          device: 'unknown',
          browser: 'other',
        },
      })
    })

    it('tells a partial challenge from a complete one, and drops a country that is not a code', async () => {
      mockCheckBotId.mockResolvedValue(verdict(true))

      await refuseIfBot(
        'POST /api/auth/register',
        request({ 'x-is-human': '{}', 'x-vercel-ip-country': '<script>' })
      )

      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ challengeHeaders: 'partial', country: null, browser: 'unknown' }),
        })
      )
    })

    it('tells all three headers with no challenge in them from a complete challenge', async () => {
      mockCheckBotId.mockResolvedValue(verdict(true))

      await refuseIfBot(
        'POST /api/auth/register',
        request({ 'x-is-human': 'undefined', 'x-path': '/api/auth/register', 'x-method': 'POST' })
      )

      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ challengeHeaders: 'empty' }) })
      )
    })

    it('keeps a verdict string only when it is a plain label', async () => {
      mockCheckBotId.mockResolvedValue({
        ...verdict(true),
        verifiedBotName: 'a'.repeat(100),
        classificationReason: 'seen from 203.0.113.7 <x>, "quoted"',
      } as never)

      await refuseIfBot('POST /api/auth/register', request({}))

      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ verifiedBotName: 'a'.repeat(64), classificationReason: null }),
        })
      )
    })

    it('writes the event once however often the route settles', async () => {
      mockCheckBotId.mockResolvedValue(verdict(true))

      const check = await checkBot('POST /api/auth/guest-session', request({}))
      await check.settle({ mintedGuest: true })
      await check.settle({ mintedGuest: false })

      expect(check.refusal).toBeNull()
      expect(recordServerReliabilityEvent).toHaveBeenCalledTimes(1)
      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ mintedGuest: true }) })
      )
    })

    it('records nothing for a person, and at most one flag a minute per instance', async () => {
      mockCheckBotId.mockResolvedValue(verdict(false))
      await refuseIfBot('POST /api/auth/register', request({}))
      expect(recordServerReliabilityEvent).not.toHaveBeenCalled()

      mockCheckBotId.mockResolvedValue(verdict(true))
      for (let i = 0; i < 3; i += 1) await refuseIfBot('POST /api/auth/register', request({}))
      expect(mockLogWarn).toHaveBeenCalledTimes(3)
      expect(recordServerReliabilityEvent).toHaveBeenCalledTimes(1)
    })
  })

  it('fails open when BotID itself errors: the rate limits still apply', async () => {
    process.env.VERCEL_ENV = 'production'
    mockCheckBotId.mockRejectedValue(new Error('VERCEL_OIDC_TOKEN is not set'))

    expect(await refuseIfBot('POST /api/auth/register', browserPost())).toBeNull()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(recordServerReliabilityEvent).toHaveBeenCalledWith({
      eventName: 'botid_unavailable',
      source: 'POST /api/auth/register',
      reason: 'VERCEL_OIDC_TOKEN is not set',
    })
  })

  describe('when BotID gives no verdict', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production'
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('reads an answer without a boolean isBot as no verdict, not as a person', async () => {
      // What botid/server returns for an error body such as 401 {"error":"ERR_JWT_INVALID"}:
      // it copies `isHuman: !s.isBot`, so isHuman is true and isBot is undefined.
      mockCheckBotId.mockResolvedValue({ isHuman: true } as never)

      expect(await refuseIfBot('POST /api/auth/guest-session', browserPost())).toBeNull()

      expect(mockLogError).toHaveBeenCalledTimes(1)
      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'botid_unavailable',
          source: 'POST /api/auth/guest-session',
          reason: expect.stringContaining('without a verdict'),
        })
      )
      expect(mockLogWarn).not.toHaveBeenCalled()
    })

    it('stops waiting after 2.5 s and lets the request through', async () => {
      jest.useFakeTimers()
      mockCheckBotId.mockReturnValue(new Promise(() => {}))

      let settled: unknown = 'pending'
      const pending = refuseIfBot('POST /api/auth/register', browserPost()).then((result) => {
        settled = result
      })

      await jest.advanceTimersByTimeAsync(BOTID_TIMEOUT_MS - 1)
      expect(settled).toBe('pending')

      await jest.advanceTimersByTimeAsync(1)
      await pending
      expect(BOTID_TIMEOUT_MS).toBe(2_500)
      expect(settled).toBeNull()
      expect(recordServerReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'botid_unavailable', reason: 'no answer within 2500 ms' })
      )
    })

    it('handles a check that rejects after the deadline has already won', async () => {
      jest.useFakeTimers()
      let rejectLate: (error: Error) => void = () => {}
      mockCheckBotId.mockReturnValue(new Promise((_resolve, reject) => { rejectLate = reject }))

      const pending = refuseIfBot('POST /api/auth/register', browserPost())
      await jest.advanceTimersByTimeAsync(BOTID_TIMEOUT_MS)
      expect(await pending).toBeNull()

      // An unhandled rejection here would fail the test run.
      rejectLate(new Error('late failure'))
      await Promise.resolve()
    })

    it('logs every time but records the event at most once a minute per instance', async () => {
      mockCheckBotId.mockResolvedValue({ isHuman: true } as never)

      for (let i = 0; i < 5; i += 1) await refuseIfBot('POST /api/auth/register', browserPost())

      expect(mockLogError).toHaveBeenCalledTimes(5)
      expect(recordServerReliabilityEvent).toHaveBeenCalledTimes(1)
    })
  })
})

describe('user-agent classes for the botid_flagged payload (#1157)', () => {
  it.each([
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', 'mobile', 'safari'],
    ['iPhone Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1', 'mobile', 'chrome'],
    ['iPad Safari', 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'tablet', 'safari'],
    ['Android tablet', 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'tablet', 'chrome'],
    ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'mobile', 'samsung'],
    ['Instagram in-app', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0', 'mobile', 'instagram'],
    ['Windows Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 'desktop', 'edge'],
    ['macOS Firefox', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0', 'desktop', 'firefox'],
    ['Linux Opera', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0', 'desktop', 'opera'],
    ['headless Chrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36', 'desktop', 'headless'],
    ['Android WebView', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36', 'mobile', 'webview'],
    ['iOS WKWebView', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'mobile', 'webview'],
    ['curl', 'curl/8.7.1', 'unknown', 'http-client'],
    ['nothing', '', 'unknown', 'unknown'],
  ])('%s', (_label, ua, device, browser) => {
    expect(deviceClass(ua)).toBe(device)
    expect(browserFamily(ua)).toBe(browser)
  })
})

describe('BotID routes (#1157)', () => {
  it('is Basic everywhere, never Deep Analysis, which is billed per call', () => {
    expect(BOTID_CHECK_LEVEL).toBe('basic')
    for (const route of BOTID_PROTECTED_ROUTES) {
      expect(route.advancedOptions.checkLevel).toBe(BOTID_CHECK_LEVEL)
    }
  })

  it('covers the three POSTs that mint an account or a guest, and nothing else', () => {
    const covers = (method: string, pathname: string) =>
      BOTID_PROTECTED_ROUTES.some((route) => route.method === method && botIdPathMatches(route.path, pathname))

    expect(covers('POST', '/api/auth/register')).toBe(true)
    expect(covers('POST', '/api/auth/guest-session')).toBe(true)
    expect(covers('POST', '/api/lobby/1234/join-guest')).toBe(true)

    expect(covers('GET', '/api/auth/guest-session')).toBe(false)
    expect(covers('POST', '/api/lobby')).toBe(false)
    expect(covers('POST', '/api/lobby/1234/chat')).toBe(false)
    expect(covers('POST', '/api/auth/callback/credentials')).toBe(false)
  })

  it('is what the browser half initialises with, from instrumentation-client rather than a layout', () => {
    // A layout would be the other documented place, and a server component reading anything
    // per request there would turn the prerendered guide pages dynamic.
    const source = readFileSync(path.join(process.cwd(), 'instrumentation-client.ts'), 'utf8')
    expect(source).toMatch(/import \{ initBotId \} from "botid\/client\/core"/)
    expect(source).toMatch(/initBotId\(\{ protect: BOTID_PROTECTED_ROUTES \}\)/)
  })

  it('wraps next.config with withBotId, so the challenge is served from this origin', async () => {
    const config = require(path.join(process.cwd(), 'next.config.js'))
    const rewrites = await config.rewrites()
    const list = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? [])]

    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: 'https://api.vercel.com/bot-protection/v1/challenge' }),
      ])
    )
  })
})
