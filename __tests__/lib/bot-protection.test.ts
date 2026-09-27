/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkBotId } from 'botid/server'
import { refuseIfBot } from '@/lib/bot-protection'
import { BOTID_CHECK_LEVEL, BOTID_PROTECTED_ROUTES } from '@/lib/botid-routes'

jest.mock('botid/server', () => ({ checkBotId: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockCheckBotId = checkBotId as jest.MockedFunction<typeof checkBotId>

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

    expect(await refuseIfBot('POST /api/auth/register')).toBeNull()
    expect(mockCheckBotId).not.toHaveBeenCalled()
  })

  it.each(['production', 'preview'])('checks at the Basic level on %s', async (env) => {
    process.env.VERCEL_ENV = env

    expect(await refuseIfBot('POST /api/auth/register')).toBeNull()
    expect(mockCheckBotId).toHaveBeenCalledWith({ advancedOptions: { checkLevel: 'basic' } })
  })

  it('answers 403 with a code the client translates when BotID says bot', async () => {
    process.env.VERCEL_ENV = 'production'
    mockCheckBotId.mockResolvedValue(verdict(true))

    const response = await refuseIfBot('POST /api/auth/guest-session')

    expect(response?.status).toBe(403)
    expect(await response?.json()).toMatchObject({
      code: 'BOT_CHECK_FAILED',
      translationKey: 'errors.botCheckFailed',
    })
  })

  it('fails open when BotID itself errors: the rate limits still apply', async () => {
    process.env.VERCEL_ENV = 'production'
    mockCheckBotId.mockRejectedValue(new Error('VERCEL_OIDC_TOKEN is not set'))

    expect(await refuseIfBot('POST /api/auth/register')).toBeNull()
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
