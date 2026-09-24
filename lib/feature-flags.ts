/**
 * Feature flags.
 *
 * These read the environment only, and they stay that way: they are called from client
 * components and from build-time checks, neither of which can await a database read. The
 * async versions in `lib/runtime-config.ts` let the control panel override any of them
 * without a deploy, and fall back to exactly these values when no row exists.
 */
function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isTelephoneDoodleEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_TELEPHONE_DOODLE) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_TELEPHONE_DOODLE)
  )
}

export function isSketchAndGuessEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_SKETCH_AND_GUESS) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS)
  )
}

export function isFakeArtistEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_FAKE_ARTIST) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_FAKE_ARTIST)
  )
}

/**
 * Is this process provably NOT the production deployment?
 *
 * Vercel sets `VERCEL_ENV` to 'production' | 'preview' | 'development' on the server, and
 * only the `NEXT_PUBLIC_` copy survives into a client bundle, so both are read. Both have
 * to be spelled out literally: Next inlines a `NEXT_PUBLIC_` read by matching the source
 * text `process.env.NEXT_PUBLIC_VERCEL_ENV`, and a computed lookup would come back
 * undefined in the browser - which is the direction that opens production up, not the one
 * that closes it.
 *
 * The answer is an allowlist, and every unknown is a no:
 *
 *   - either variable saying 'production' is a no, whatever the other one says
 *   - a value that is neither 'preview' nor 'development' is a no, so a typo, a renamed
 *     Vercel environment or a half-copied env file cannot read as safe
 *   - neither variable set means this is not a Vercel deployment at all, and then
 *     `NODE_ENV` decides: a production build is a no, `pnpm dev` and jest are a yes
 *
 * boardly.online runs on Vercel with VERCEL_ENV=production, so the first rule alone covers
 * the real site; the rest are there so nothing else can be mistaken for it.
 */
function isNonProductionDeployment(): boolean {
  const declared = [process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_VERCEL_ENV]
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter((value) => value.length > 0)

  if (declared.length > 0) {
    return declared.every((value) => value === 'preview' || value === 'development')
  }

  return process.env.NODE_ENV !== 'production'
}

/**
 * Is this actually the production deployment — not merely a production *build*?
 *
 * `next build` sets `NODE_ENV=production` for a Vercel Preview deployment too, so
 * `process.env.NODE_ENV === 'production'` alone cannot tell Preview from Production and
 * must not be used for anything that should stay off Preview (#1152: the AdSense/consent
 * loader). This is the exported affirmative of `isNonProductionDeployment` above — same
 * VERCEL_ENV-first, NODE_ENV-fallback logic, so it agrees with every other flag in this
 * file about what counts as "real production".
 */
export function isProductionDeployment(): boolean {
  return !isNonProductionDeployment()
}

/**
 * Play an `in-development` catalog game locally or on a preview deployment (#1054).
 *
 * `availability` is a product decision, and until it is taken the game cannot be reached
 * at all: `isTemporarilyUnavailableGameType` makes POST /api/lobby and POST /api/game/create
 * answer 400, so the only way to check that a game is playable - which is what the decision
 * is supposed to be gated on - was to read its code instead of playing it. Two agents did
 * exactly that in the week of 2026-09-15, and a reviewer then found an empty content region
 * on a game's most-seen screen that a player would have hit in seconds.
 *
 * Shaped like the three flags above so the repo keeps one mechanism, with the one difference
 * that is the whole point: **it is dead on production whatever the variable says.** A
 * per-game flag such as ENABLE_SKETCH_AND_GUESS is a release lever Denys may want to pull on
 * boardly.online; this one is a workbench, and a workbench a stray Vercel production variable
 * could switch on is worse than no workbench at all.
 *
 * Deliberately absent from RUNTIME_FLAG_KEYS below: those are the keys the control panel may
 * override from the database, which is a route into production this flag must not have.
 *
 * **Set both variables.** The two reads are not interchangeable: `ENABLE_IN_DEVELOPMENT_GAMES`
 * is what a server route sees, and only `NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES` is inlined
 * into a client bundle - while `app/lobby/create/page.tsx`, `components/HomePage/GameRibbon.tsx`
 * and `components/HomePage/QuickPlayButton.tsx` all render the catalog through this same gate in
 * the browser. With only the server one set, POST /api/lobby accepts the game and no picker on
 * the site lists it; checked in a browser on 2026-09-20, where the server-rendered home page
 * carried a Liar's Party link and the hydrated page had dropped it. They are ORed rather than ANDed so this flag keeps the shape of the three
 * per-game flags above; `__tests__/api/in-development-game-gate.test.ts` covers each read on its
 * own so neither can be deleted as dead code.
 */
export function isInDevelopmentGamePlayEnabled(): boolean {
  if (!isNonProductionDeployment()) {
    return false
  }

  return (
    parseBooleanFlag(process.env.ENABLE_IN_DEVELOPMENT_GAMES) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES)
  )
}

/**
 * The keys the control panel may override, so its editor cannot invent one nothing reads.
 *
 * A plain list of strings on purpose: this file is reachable from client components, so it
 * must not import anything that touches the database. The async resolvers live in
 * `lib/runtime-config.ts`, which is server-only, and the dependency runs one way.
 */
export const RUNTIME_FLAG_KEYS = ['telephone_doodle', 'sketch_and_guess', 'fake_artist'] as const
export type RuntimeFlagKey = (typeof RUNTIME_FLAG_KEYS)[number]
