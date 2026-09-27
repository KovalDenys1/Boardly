import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { BOTID_CHECK_LEVEL } from './botid-routes'
import { apiLogger } from './logger'

const log = apiLogger('bot-protection')

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

/**
 * Vercel BotID (Basic) for a route that mints an account or a guest (#1157). Returns a 403 to
 * send when Vercel classifies the request as a bot, or null to carry on.
 *
 * The route must also be listed in `BOTID_PROTECTED_ROUTES`, or the browser never attaches the
 * challenge and every caller looks like a bot. A direct request - curl, a script, Playwright's
 * `request` context - carries no challenge, so on a deployment it is refused here; locally it
 * is not checked at all.
 *
 * Fails open: if BotID itself errors, the request goes on to the route's rate limits, which
 * still apply. Refusing every signup and every new guest because a second line of defence had
 * a bad minute is the outage #1156 was about; the error is logged.
 */
export async function refuseIfBot(route: string): Promise<NextResponse | null> {
  if (!botIdApplies()) return null

  try {
    const verification = await checkBotId({ advancedOptions: { checkLevel: BOTID_CHECK_LEVEL } })
    if (!verification.isBot) return null

    log.warn('Refused a request BotID classified as a bot', {
      route,
      verifiedBot: verification.isVerifiedBot,
    })
    return NextResponse.json(
      {
        error: 'Your browser could not be verified. Please reload the page and try again.',
        code: 'BOT_CHECK_FAILED',
        translationKey: 'errors.botCheckFailed',
      },
      { status: 403 }
    )
  } catch (error) {
    log.error('BotID check failed; letting the request through', error instanceof Error ? error : new Error(String(error)), {
      route,
    })
    return null
  }
}
