import { BotDifficulty } from './bot-types'

const DEFAULT_DELAY_SCALE = 1.5
const MIN_DELAY_SCALE = 0
const MAX_DELAY_SCALE = 2
const DEFAULT_DELAY_MIN_MS = 0
const DEFAULT_DELAY_MAX_MS = 2000

const DIFFICULTY_MULTIPLIER: Record<BotDifficulty, number> = {
  easy: 1.15,
  medium: 1,
  hard: 0.85,
}

const MAX_DIFFICULTY_MULTIPLIER = Math.max(...Object.values(DIFFICULTY_MULTIPLIER))

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNonNegativeInt(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function botDelay(difficulty: BotDifficulty, baseMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, resolveBotUxDelayMs(difficulty, baseMs)))
}

export function resolveBotUxDelayMs(difficulty: BotDifficulty, baseDelayMs: number): number {
  const safeBaseDelayMs = Number.isFinite(baseDelayMs) ? Math.max(0, Math.round(baseDelayMs)) : 0
  const overrideDelayMs = parseNonNegativeInt(process.env.BOT_UX_DELAY_MS)

  const configuredScale = parseFiniteNumber(process.env.BOT_UX_DELAY_SCALE)
  const resolvedScale = clamp(configuredScale ?? DEFAULT_DELAY_SCALE, MIN_DELAY_SCALE, MAX_DELAY_SCALE)

  const configuredMinDelayMs = parseNonNegativeInt(process.env.BOT_UX_DELAY_MIN_MS)
  const configuredMaxDelayMs = parseNonNegativeInt(process.env.BOT_UX_DELAY_MAX_MS)
  const minDelayMs = configuredMinDelayMs ?? DEFAULT_DELAY_MIN_MS
  const maxDelayMs = configuredMaxDelayMs ?? DEFAULT_DELAY_MAX_MS
  const lowerBoundMs = Math.min(minDelayMs, maxDelayMs)
  const upperBoundMs = Math.max(minDelayMs, maxDelayMs)

  const difficultyMultiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1
  const scaledDelayMs = Math.round(safeBaseDelayMs * resolvedScale * difficultyMultiplier)
  const candidateDelayMs = overrideDelayMs ?? scaledDelayMs

  // The env knobs may only make a bot faster, never slower than the pace its
  // executor codes for. `lib/bots/core/bot-turn-pace.ts` derives the client's
  // bot-turn recovery grace from `botUxDelayUpperBoundMs` of the same base
  // delays, and the client cannot read these server-only variables - so an
  // operator who raised BOT_UX_DELAY_MAX_MS or BOT_UX_DELAY_MS used to be able
  // to push a bot's in-turn pause past the grace and put a 409 on every turn
  // (#1049). Bounding the output here is what keeps those two numbers tied.
  return Math.min(
    clamp(candidateDelayMs, lowerBoundMs, upperBoundMs),
    botUxDelayUpperBoundMs(safeBaseDelayMs),
  )
}

/**
 * The longest `resolveBotUxDelayMs` may return for this base delay, under any
 * configuration: the default scale ceiling times the slowest difficulty, itself
 * capped by the module's default maximum. Env cannot raise it - see the note in
 * `resolveBotUxDelayMs`.
 */
export function botUxDelayUpperBoundMs(baseDelayMs: number): number {
  const safeBaseDelayMs = Number.isFinite(baseDelayMs) ? Math.max(0, Math.round(baseDelayMs)) : 0
  return Math.min(
    Math.round(safeBaseDelayMs * MAX_DELAY_SCALE * MAX_DIFFICULTY_MULTIPLIER),
    DEFAULT_DELAY_MAX_MS,
  )
}
