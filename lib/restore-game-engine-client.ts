import type { GameEngine } from './game-engine'
import {
  DEFAULT_GAME_TYPE,
  isSupportedGameType,
  type SupportedCatalogGameType,
} from './game-catalog'

function normalizeGameType(gameType: string): SupportedCatalogGameType {
  return isSupportedGameType(gameType) ? gameType : DEFAULT_GAME_TYPE
}

async function createGameEngineClient(
  gameType: SupportedCatalogGameType,
  gameId: string,
): Promise<GameEngine> {
  switch (gameType) {
    case 'yahtzee': {
      const { YahtzeeGame } = await import('./games/yahtzee-game')
      return new YahtzeeGame(gameId, { maxPlayers: 4, minPlayers: 1 })
    }
    case 'guess_the_spy': {
      const { SpyGame } = await import('./games/spy-game')
      return new SpyGame(gameId)
    }
    case 'tic_tac_toe': {
      const { TicTacToeGame } = await import('./games/tic-tac-toe-game')
      return new TicTacToeGame(gameId, { maxPlayers: 2, minPlayers: 2 })
    }
    case 'rock_paper_scissors': {
      const { RockPaperScissorsGame } = await import('./games/rock-paper-scissors-game')
      return new RockPaperScissorsGame(gameId, { maxPlayers: 2, minPlayers: 2 })
    }
    case 'memory': {
      const { MemoryGame } = await import('./games/memory-game')
      return new MemoryGame(gameId, { maxPlayers: 4, minPlayers: 2 })
    }
    case 'telephone_doodle': {
      const { TelephoneDoodleGame } = await import('./games/telephone-doodle-game')
      return new TelephoneDoodleGame(gameId, { maxPlayers: 12, minPlayers: 3 })
    }
    case 'sketch_and_guess': {
      const { SketchAndGuessGame } = await import('./games/sketch-and-guess-game')
      return new SketchAndGuessGame(gameId, { maxPlayers: 10, minPlayers: 3 })
    }
    case 'liars_party': {
      const { LiarsPartyGame } = await import('./games/liars-party-game')
      return new LiarsPartyGame(gameId, { maxPlayers: 12, minPlayers: 4 })
    }
    case 'fake_artist': {
      const { FakeArtistGame } = await import('./games/fake-artist-game')
      return new FakeArtistGame(gameId, { maxPlayers: 10, minPlayers: 4 })
    }
    default: {
      const exhausted: never = gameType
      throw new Error(`Unsupported game type: ${String(exhausted)}`)
    }
  }
}

export async function restoreGameEngineClient(
  gameType: string,
  gameId: string,
  savedState: unknown,
): Promise<GameEngine> {
  const normalizedType = normalizeGameType(gameType)
  const engine = await createGameEngineClient(normalizedType, gameId)
  engine.restoreState(savedState as any)
  return engine
}
