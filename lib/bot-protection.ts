import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { BOTID_CHECK_LEVEL } from './botid-routes'
import { apiLogger } from './logger'
import { browserFamily, deviceClass } from './user-agent-class'

const log = apiLogger('bot-protection')

/**
 * How long a request waits for Vercel's classification before going on without one.
 * `checkBotId()` has no deadline of its own - it is a plain fetch to api.vercel.com - and a
 * function may run for 300 s, so a slow classifier would otherwise hold every signup and every
 * new guest for as long as it liked.
 */
export const BOTID_TIMEOUT_MS = 2_500

/** An unavailable classifier is recorded at most once a minute per instance. */
const UNAVAILABLE_EVENT_INTERVAL_MS = 60 * 1000
let lastUnavailableReportAt: number | null = null

/**
 * Whether this process is a Vercel deployment, the only place `checkBotId()` can answer.
 *
 * Outside one there is nothing to ask: in `next dev` the library answers "human" by itself,
 * and under `next start`, CI or jest it throws for want of the deployment's OIDC token. So
 * the check runs on production and preview deployments only - preview included, so a
 * misconfiguration that would refuse real browsers shows there before it reaches
 * boardly.online. `VERCEL_ENV` is a Vercel system variable; `vercel env pull` writes
 * `development` for a local copy, which stays unchecked.
 */
function botIdApplies(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'
}

type Verdict = {
  isBot: boolean
  isVerifiedBot: boolean
  verifiedBotName: string | null
  verifiedBotCategory: string | null
  bypassed: boolean | null
  classificationReason: string | null
}

type Classification = { kind: 'verdict'; verdict: Verdict } | { kind: 'unavailable'; reason: string }

const VERDICT_TEXT_MAX_LENGTH = 64

function verdictText(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[\w .:/-]+$/.test(value)) return null
  return value.slice(0, VERDICT_TEXT_MAX_LENGTH)
}

/**
 * Asks Vercel, with a deadline, and insists on an answer.
 *
 * `botid/server` does not check the classifier's HTTP status: an error body such as
 * `{"error":"ERR_JWT_INVALID"}` comes back as `{ isHuman: true, isBot: undefined, ... }`,
 * which a plain `if (verification.isBot)` reads as a person. So a verdict counts only when
 * `isBot` is a boolean; anything else is "unavailable", like a throw or the deadline.
 */
async function classify(): Promise<Classification> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), BOTID_TIMEOUT_MS)
  })

  try {
    // Promise.race subscribes to the check too, so if it rejects after the deadline has
    // won, the rejection is handled rather than left unhandled.
    const result = await Promise.race([
      checkBotId({ advancedOptions: { checkLevel: BOTID_CHECK_LEVEL } }),
      deadline,
    ])
    if (result === 'timeout') {
      return { kind: 'unavailable', reason: `no answer within ${BOTID_TIMEOUT_MS} ms` }
    }
    const verification = result as Record<string, unknown> | null | undefined
    if (typeof verification?.isBot !== 'boolean') {
      return { kind: 'unavailable', reason: 'answered without a verdict (isBot is not a boolean)' }
    }
    return {
      kind: 'verdict',
      verdict: {
        isBot: verification.isBot,
        isVerifiedBot: verification.isVerifiedBot === true,
        verifiedBotName: verdictText(verification.verifiedBotName),
        verifiedBotCategory: verdictText(verification.verifiedBotCategory),
        bypassed: typeof verification.bypassed === 'boolean' ? verification.bypassed : null,
        classificationReason: verdictText(verification.classificationReason),
      },
    }
  } catch (error) {
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The classifier could not be used, so this request went through unchecked: logged every
 * time, and written as a `botid_unavailable` OperationalEvent at most once a minute per
 * instance, which the reliability alert of the same name reads (lib/operational-metrics.ts).
 */
async function reportUnavailable(route: string, reason: string): Promise<void> {
  log.error('BotID gave no verdict; letting the request through', new Error(reason), { route })

  const now = Date.now()
  if (lastUnavailableReportAt !== null && now - lastUnavailableReportAt < UNAVAILABLE_EVENT_INTERVAL_MS) return
  lastUnavailableReportAt = now

  try {
    // Imported lazily, as lib/rate-limit.ts does: the database is only needed on this path.
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({ eventName: 'botid_unavailable', source: route, reason })
  } catch {
    // Bookkeeping must never fail the request.
  }
}

/**
 * `BOTID_MODE=monitor` logs a bot verdict instead of refusing the request.
 *
 * Set in production on 2026-09-27, right after the first release: an extension-driven Chrome
 * passed once and was then classified as a bot, and with no other guest traffic that Sunday
 * there was no way to show real people pass. Guest entry is the whole funnel, so BotID
 * records for a week first, the same decision Denys took for Vercel's Bot Protection
 * (#1144). Remove the variable and redeploy to enforce.
 */
function botIdMonitorOnly(): boolean {
  return process.env.BOTID_MODE === 'monitor'
}

// What botid 1.5.x's browser half sets on a protected request (botid/dist/client/core).
const BOTID_CHALLENGE_HEADERS = ['x-is-human', 'x-path', 'x-method'] as const

/**
 * What a flagged request looked like, coarse enough to read in aggregate: no IP address, no
 * User-Agent string, no guest id, no header value. Country, device class and browser family
 * answer "same network or same kind of device" for a burst of flags.
 */
type FlaggedPayload = {
  route: string
  challengeHeaders: 'complete' | 'empty' | 'partial' | 'none'
  country: string | null
  device: string
  browser: string
} & Verdict

function challengeHeaderState(present: number, challenge: string | null): FlaggedPayload['challengeHeaders'] {
  if (present === 0) return 'none'
  if (present < BOTID_CHALLENGE_HEADERS.length) return 'partial'
  // The browser half sends JSON.stringify(challenge), which is "undefined" or "{}" when none was ready.
  return challenge === null || challenge.length <= 4 || challenge === 'undefined' ? 'empty' : 'complete'
}

function describeFlaggedRequest(route: string, request: Request, verdict: Verdict): FlaggedPayload {
  const present = BOTID_CHALLENGE_HEADERS.filter((name) => request.headers.has(name)).length
  const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() ?? ''
  const userAgent = request.headers.get('user-agent')
  return {
    route,
    challengeHeaders: challengeHeaderState(present, request.headers.get('x-is-human')),
    ...verdict,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    device: deviceClass(userAgent),
    browser: browserFamily(userAgent),
  }
}

/**
 * A bot verdict in monitor mode is logged every time and recorded at most once a minute per
 * instance. The slot is taken when the verdict arrives, not when the route settles, so the
 * request a minute keeps is the first one flagged, whatever its outcome.
 */
let lastFlaggedReportAt: number | null = null
function takeFlaggedSlot(): boolean {
  const now = Date.now()
  if (lastFlaggedReportAt !== null && now - lastFlaggedReportAt < UNAVAILABLE_EVENT_INTERVAL_MS) return false
  lastFlaggedReportAt = now
  return true
}

async function reportFlagged(payload: FlaggedPayload, mintedGuest: boolean): Promise<void> {
  try {
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({
      eventName: 'botid_flagged',
      source: payload.route,
      reason: payload.isVerifiedBot ? 'verified bot' : 'bot',
      payload: { ...payload, mintedGuest },
    })
  } catch {
    // Bookkeeping must never fail the request.
  }
}

/**
 * The result of asking BotID. `refusal` is the 403 to send, or null to carry on. `settle` is
 * called once the route knows whether it minted a guest; in monitor mode it writes the
 * `botid_flagged` event then, so the event can say whether the flagged caller got a guest. It
 * never throws and writes at most once.
 */
export interface BotCheck {
  refusal: NextResponse | null
  settle(outcome: { mintedGuest: boolean }): Promise<void>
}

const NOTHING_TO_SETTLE = async () => {}

/**
 * Vercel BotID (Basic) for a route that mints an account or a guest (#1157). Its `refusal` is
 * a 403 to send when Vercel classifies the request as a bot, or null to carry on.
 *
 * The route must also be listed in `BOTID_PROTECTED_ROUTES`, or the browser never attaches the
 * challenge and every caller looks like a bot. A direct request - curl, a script, Playwright's
 * `request` context - carries no challenge, so on a deployment it is refused here; locally it
 * is not checked at all.
 *
 * Fails open: when BotID throws, times out or answers without a verdict, the request goes on
 * to the route's rate limits, which still apply, and the failure is logged and recorded.
 * Refusing every signup and every new guest because a second line of defence had a bad
 * minute is the outage #1156 was about.
 */
export async function checkBot(route: string, request: Request): Promise<BotCheck> {
  const passed: BotCheck = { refusal: null, settle: NOTHING_TO_SETTLE }
  if (!botIdApplies()) return passed

  const classification = await classify()
  if (classification.kind === 'unavailable') {
    await reportUnavailable(route, classification.reason)
    return passed
  }
  const { verdict } = classification
  if (!verdict.isBot) return passed

  if (botIdMonitorOnly()) {
    log.warn('BotID classified a request as a bot; monitor mode lets it through', {
      route,
      verifiedBot: verdict.isVerifiedBot,
    })
    if (!takeFlaggedSlot()) return passed
    const payload = describeFlaggedRequest(route, request, verdict)
    let settled = false
    return {
      refusal: null,
      async settle({ mintedGuest }) {
        if (settled) return
        settled = true
        await reportFlagged(payload, mintedGuest)
      },
    }
  }

  log.warn('Refused a request BotID classified as a bot', {
    route,
    verifiedBot: verdict.isVerifiedBot,
  })
  return {
    refusal: NextResponse.json(
      {
        error: 'Your browser could not be verified. Please reload the page and try again.',
        code: 'BOT_CHECK_FAILED',
        translationKey: 'errors.botCheckFailed',
      },
      { status: 403 }
    ),
    settle: NOTHING_TO_SETTLE,
  }
}

/** `checkBot` for a route that mints no guest (register), settled at once. */
export async function refuseIfBot(route: string, request: Request): Promise<NextResponse | null> {
  const check = await checkBot(route, request)
  await check.settle({ mintedGuest: false })
  return check.refusal
}

export const __botProtectionTestUtils = {
  reset() {
    lastUnavailableReportAt = null
    lastFlaggedReportAt = null
  },
}
