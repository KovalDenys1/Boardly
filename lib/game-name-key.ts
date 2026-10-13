import type { TranslationKeys } from '@/lib/i18n-helpers'

const NAME_KEYS: Record<string, TranslationKeys> = {
  yahtzee: 'games.yahtzee.name',
  guess_the_spy: 'games.spy.name',
  tic_tac_toe: 'games.tictactoe.name',
  memory: 'games.memory.name',
  connect_four: 'games.connect_four.name',
  alias: 'games.alias.name',
  liars_party: 'games.liars_party.name',
  rock_paper_scissors: 'games.rock_paper_scissors.name',
  sketch_and_guess: 'games.guess_my_drawing.name',
  checkers: 'games.checkers.name',
  ludo: 'games.ludo.name',
}

/** The translated name of a game by its `GameType`, or null for one without a page. */
export function gameNameKey(gameType: string): TranslationKeys | null {
  return NAME_KEYS[gameType] ?? null
}
