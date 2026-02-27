import { Move, Player } from '@/lib/game-engine'
import { MemoryCard, MemoryGame, MemoryGameData } from '@/lib/games/memory-game'

const PLAYER_ONE: Player = { id: 'player-1', name: 'Player 1' }
const PLAYER_TWO: Player = { id: 'player-2', name: 'Player 2' }

function buildMove(playerId: string, type: string, data: Record<string, unknown> = {}): Move {
  return {
    playerId,
    type,
    data,
    timestamp: new Date(),
  }
}

function getData(game: MemoryGame): MemoryGameData {
  return game.getState().data as MemoryGameData
}

function restoreWithCards(game: MemoryGame, cards: MemoryCard[]) {
  const state = game.getState()
  const data = state.data as MemoryGameData
  data.cards = cards
  data.flippedCardIds = []
  data.pendingMismatchCardIds = []
  data.scores = {
    [PLAYER_ONE.id]: 0,
    [PLAYER_TWO.id]: 0,
  }
  game.restoreState(state)
}

describe('MemoryGame', () => {
  it('initializes easy mode by default', () => {
    const game = new MemoryGame('memory-default')
    const data = game.getInitialGameData()

    expect(data.difficulty).toBe('easy')
    expect(data.gridColumns).toBe(4)
    expect(data.gridRows).toBe(4)
    expect(data.cards).toHaveLength(16)

    const symbolCounts = data.cards.reduce<Record<string, number>>((acc, card) => {
      acc[card.value] = (acc[card.value] ?? 0) + 1
      return acc
    }, {})
    expect(Object.values(symbolCounts).every((count) => count === 2)).toBe(true)
  })

  it('supports medium and hard deck sizes', () => {
    const medium = new MemoryGame('memory-medium', {
      maxPlayers: 4,
      minPlayers: 2,
      rules: { difficulty: 'medium' },
    })
    const hard = new MemoryGame('memory-hard', {
      maxPlayers: 4,
      minPlayers: 2,
      rules: { difficulty: 'hard' },
    })

    expect((medium.getInitialGameData() as MemoryGameData).cards).toHaveLength(20)
    expect((hard.getInitialGameData() as MemoryGameData).cards).toHaveLength(36)
  })

  it('scores matched pairs and keeps turn with current player', () => {
    const game = new MemoryGame('memory-match')
    game.addPlayer(PLAYER_ONE)
    game.addPlayer(PLAYER_TWO)
    expect(game.startGame()).toBe(true)

    restoreWithCards(game, [
      { id: 'a1', value: 'A', isMatched: false, isFlipped: false },
      { id: 'a2', value: 'A', isMatched: false, isFlipped: false },
      { id: 'b1', value: 'B', isMatched: false, isFlipped: false },
      { id: 'b2', value: 'B', isMatched: false, isFlipped: false },
    ])

    expect(game.makeMove(buildMove(PLAYER_ONE.id, 'flip', { cardId: 'a1' }))).toBe(true)
    expect(game.makeMove(buildMove(PLAYER_ONE.id, 'flip', { cardId: 'a2' }))).toBe(true)

    const data = getData(game)
    expect(data.cards.find((card) => card.id === 'a1')?.isMatched).toBe(true)
    expect(data.cards.find((card) => card.id === 'a2')?.isMatched).toBe(true)
    expect(data.scores[PLAYER_ONE.id]).toBe(1)
    expect(game.getState().currentPlayerIndex).toBe(0)
  })

  it('requires resolve-mismatch before the next player acts and then advances turn', () => {
    const game = new MemoryGame('memory-mismatch')
    game.addPlayer(PLAYER_ONE)
    game.addPlayer(PLAYER_TWO)
    expect(game.startGame()).toBe(true)

    restoreWithCards(game, [
      { id: 'a1', value: 'A', isMatched: false, isFlipped: false },
      { id: 'a2', value: 'A', isMatched: false, isFlipped: false },
      { id: 'b1', value: 'B', isMatched: false, isFlipped: false },
      { id: 'b2', value: 'B', isMatched: false, isFlipped: false },
    ])

    expect(game.makeMove(buildMove(PLAYER_ONE.id, 'flip', { cardId: 'a1' }))).toBe(true)
    expect(game.makeMove(buildMove(PLAYER_ONE.id, 'flip', { cardId: 'b1' }))).toBe(true)

    const beforeResolve = getData(game)
    expect(beforeResolve.pendingMismatchCardIds).toEqual(['a1', 'b1'])
    expect(beforeResolve.cards.find((card) => card.id === 'a1')?.isFlipped).toBe(true)
    expect(beforeResolve.cards.find((card) => card.id === 'b1')?.isFlipped).toBe(true)

    expect(game.validateMove(buildMove(PLAYER_TWO.id, 'flip', { cardId: 'a2' }))).toBe(false)

    expect(game.makeMove(buildMove(PLAYER_ONE.id, 'resolve-mismatch'))).toBe(true)
    const afterResolve = getData(game)
    expect(afterResolve.pendingMismatchCardIds).toHaveLength(0)
    expect(afterResolve.cards.find((card) => card.id === 'a1')?.isFlipped).toBe(false)
    expect(afterResolve.cards.find((card) => card.id === 'b1')?.isFlipped).toBe(false)
    expect(game.getState().currentPlayerIndex).toBe(1)
  })

  it('finishes game and leaves winner empty for a tie', () => {
    const game = new MemoryGame('memory-tie')
    game.addPlayer(PLAYER_ONE)
    game.addPlayer(PLAYER_TWO)
    expect(game.startGame()).toBe(true)

    const state = game.getState()
    const data = state.data as MemoryGameData
    data.cards = [
      { id: 'x1', value: 'X', isMatched: true, isFlipped: true },
      { id: 'x2', value: 'X', isMatched: true, isFlipped: true },
      { id: 'y1', value: 'Y', isMatched: true, isFlipped: true },
      { id: 'y2', value: 'Y', isMatched: true, isFlipped: true },
      { id: 'z1', value: 'Z', isMatched: false, isFlipped: false },
      { id: 'z2', value: 'Z', isMatched: false, isFlipped: false },
    ]
    data.scores = {
      [PLAYER_ONE.id]: 2,
      [PLAYER_TWO.id]: 1,
    }
    data.flippedCardIds = []
    data.pendingMismatchCardIds = []
    state.currentPlayerIndex = 1
    state.players = [
      { ...PLAYER_ONE, score: 2 },
      { ...PLAYER_TWO, score: 1 },
    ]
    game.restoreState(state)

    expect(game.makeMove(buildMove(PLAYER_TWO.id, 'flip', { cardId: 'z1' }))).toBe(true)
    expect(game.makeMove(buildMove(PLAYER_TWO.id, 'flip', { cardId: 'z2' }))).toBe(true)

    const finalState = game.getState()
    expect(finalState.status).toBe('finished')
    expect((finalState.data as MemoryGameData).scores[PLAYER_TWO.id]).toBe(2)
    expect((finalState.data as MemoryGameData).winnerId).toBeNull()
    expect(finalState.winner).toBeUndefined()
    expect(game.checkWinCondition()).toBeNull()
  })
})
