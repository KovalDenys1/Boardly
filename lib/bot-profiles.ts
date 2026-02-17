import type { RegisteredGameType } from '@/lib/game-registry'

export type BotDifficulty = 'easy' | 'medium' | 'hard'

export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard']

const BOT_NAMES_BY_GAME: Record<
  RegisteredGameType,
  Record<BotDifficulty, string>
> = {
  yahtzee: {
    easy: 'Dice Rookie',
    medium: 'Dice Strategist',
    hard: 'Dice Oracle',
  },
  tic_tac_toe: {
    easy: 'Grid Rookie',
    medium: 'Grid Tactician',
    hard: 'Grid Grandmaster',
  },
  rock_paper_scissors: {
    easy: 'Tempo Rookie',
    medium: 'Pattern Reader',
    hard: 'Mind Gambit',
  },
  guess_the_spy: {
    easy: 'Spy Cadet',
    medium: 'Intel Analyst',
    hard: 'Shadow Director',
  },
}

const FALLBACK_NAMES: Record<BotDifficulty, string> = {
  easy: 'AI Rookie',
  medium: 'AI Strategist',
  hard: 'AI Mastermind',
}

function isRegisteredGameType(gameType: string): gameType is RegisteredGameType {
  return Object.prototype.hasOwnProperty.call(BOT_NAMES_BY_GAME, gameType)
}

export function normalizeBotDifficulty(
  value: unknown,
  fallback: BotDifficulty = 'medium',
): BotDifficulty {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
      return normalized
    }
  }

  return fallback
}

export function getBotDisplayName(
  gameType: string,
  difficulty: BotDifficulty = 'medium',
): string {
  if (!isRegisteredGameType(gameType)) {
    return FALLBACK_NAMES[difficulty]
  }

  return BOT_NAMES_BY_GAME[gameType][difficulty]
}

