/**
 * The requests Vercel BotID protects (#1157), shared by the browser half
 * (`instrumentation-client.ts`, which attaches the challenge headers to matching fetches) and
 * the server half (`lib/bot-protection.ts`, which asks Vercel to classify them). No imports,
 * so the client bundle can take it.
 *
 * Only the routes that mint an account or a guest: register, guest-session, and join-guest,
 * which mints a guest when it arrives without a valid token. The browser attaches the headers
 * to every join-guest POST; the server checks only the token-less ones.
 *
 * Basic, explicitly (Denys, 2026-09-27). https://vercel.com/docs/botid: Basic is free on all
 * plans; Deep Analysis costs $1 per 1,000 `checkBotId()` calls on Pro. A per-route
 * `checkLevel` takes precedence over the project's dashboard setting
 * (https://vercel.com/docs/botid/advanced-configuration), so turning Deep Analysis on in the
 * Firewall tab cannot start billing these routes - and the level must be identical on the
 * client and the server, or verification fails, which is why both read it from here.
 */
export const BOTID_CHECK_LEVEL = 'basic' as const

export const BOTID_PROTECTED_ROUTES = [
  { path: '/api/auth/register', method: 'POST', advancedOptions: { checkLevel: BOTID_CHECK_LEVEL } },
  { path: '/api/auth/guest-session', method: 'POST', advancedOptions: { checkLevel: BOTID_CHECK_LEVEL } },
  { path: '/api/lobby/*/join-guest', method: 'POST', advancedOptions: { checkLevel: BOTID_CHECK_LEVEL } },
]
