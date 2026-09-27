import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { BOTID_CHECK_LEVEL } from './botid-routes'
import { apiLogger } from './logger'

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

type Classification =
  | { kind: 'verdict'; isBot: boolean; isVerifiedBot: boolean }
  | { kind: 'unavailable'; reason: string }

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
    const verification = result as { isBot?: unknown; isVerifiedBot?: unknown } | null | undefined
    if (typeof verification?.isBot !== 'boolean') {
      return { kind: 'unavailable', reason: 'answered without a verdict (isBot is not a boolean)' }
    }
    return {
      kind: 'verdict',
      isBot: verification.isBot,
      isVerifiedBot: verification.isVerifiedBot === true,
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
 * Vercel BotID (Basic) for a route that mints an account or a guest (#1157). Returns a 403 to
 * send when Vercel classifies the request as a bot, or null to carry on.
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
export async function refuseIfBot(route: string): Promise<NextResponse | null> {
  if (!botIdApplies()) return null

  const classification = await classify()
  if (classification.kind === 'unavailable') {
    await reportUnavailable(route, classification.reason)
    return null
  }
  if (!classification.isBot) return null

  log.warn('Refused a request BotID classified as a bot', {
    route,
    verifiedBot: classification.isVerifiedBot,
  })
  return NextResponse.json(
    {
      error: 'Your browser could not be verified. Please reload the page and try again.',
      code: 'BOT_CHECK_FAILED',
      translationKey: 'errors.botCheckFailed',
    },
    { status: 403 }
  )
}

export const __botProtectionTestUtils = {
  reset() {
    lastUnavailableReportAt = null
  },
}
