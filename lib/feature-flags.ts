/**
 * Feature flags.
 *
 * These three read the environment only, and they stay that way: they are called from client
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
 * The keys the control panel may override, so its editor cannot invent one nothing reads.
 *
 * A plain list of strings on purpose: this file is reachable from client components, so it
 * must not import anything that touches the database. The async resolvers live in
 * `lib/runtime-config.ts`, which is server-only, and the dependency runs one way.
 */
export const RUNTIME_FLAG_KEYS = ['telephone_doodle', 'sketch_and_guess', 'fake_artist'] as const
export type RuntimeFlagKey = (typeof RUNTIME_FLAG_KEYS)[number]
