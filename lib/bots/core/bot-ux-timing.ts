import { BotDifficulty } from './bot-types'

const DEFAULT_DELAY_SCALE = 0.55
const MIN_DELAY_SCALE = 0
const MAX_DELAY_SCALE = 2
const DEFAULT_DELAY_MIN_MS = 0
const DEFAULT_DELAY_MAX_MS = 1200

const DIFFICULTY_MULTIPLIER: Record<BotDifficulty, number> = {
  easy: 1.15,
  medium: 1,
  hard: 0.85,
}

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

  return clamp(candidateDelayMs, lowerBoundMs, upperBoundMs)
}
