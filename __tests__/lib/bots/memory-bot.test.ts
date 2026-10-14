import { Move, Player } from '@/lib/game-engine'
import { createBot, executeBotTurn } from '@/lib/bots'
import { MemoryBot } from '@/lib/bots/memory/memory-bot'
import { MemoryCard, MemoryGame, MemoryGameData } from '@/lib/games/memory-game'

const HUMAN: Player = { id: 'human', name: 'Human' }
const BOT: Player = { id: 'bot', name: 'Memory Bot' }

function faceDown(id: string, value: string): MemoryCard {
  return { id, value, isMatched: false, isFlipped: false }
}

function boardOfPairs(values: string[]): MemoryCard[] {
  return values.flatMap((value) => [faceDown(`${value.toLowerCase()}1`, value), faceDown(`${value.toLowerCase()}2`, value)])
}

function createGame(currentPlayerIndex = 1, cards: MemoryCard[] = boardOfPairs(['A', 'B'])): MemoryGame {
  const game = new MemoryGame('memory-bot-test')
  game.addPlayer(HUMAN)
  game.addPlayer(BOT)
  game.startGame()

  const state = game.getState()
  state.currentPlayerIndex = currentPlayerIndex
  const data = state.data as MemoryGameData
  data.cards = cards
  data.flippedCardIds = []
  data.pendingMismatchCardIds = []
  data.scores = {
    [HUMAN.id]: 0,
    [BOT.id]: 0,
  }
  game.restoreState(state)

  return game
}

function flip(game: MemoryGame, player: Player, cardId: string) {
  const move: Move = { playerId: player.id, type: 'flip', data: { cardId }, timestamp: new Date() }
  if (!game.makeMove(move)) {
    throw new Error(`${player.id} could not flip ${cardId}`)
  }
}

function missPair(game: MemoryGame, player: Player, firstCardId: string, secondCardId: string) {
  flip(game, player, firstCardId)
  flip(game, player, secondCardId)
  const resolve: Move = { playerId: player.id, type: 'resolve-mismatch', data: {}, timestamp: new Date() }
  if (!game.makeMove(resolve)) {
    throw new Error(`${player.id} could not resolve ${firstCardId}/${secondCardId}`)
  }
}

function valuesForDecision(game: MemoryGame, firstCardId: string, secondCardId: string): [string, string] {
  const cards = ((game.getState().data as MemoryGameData).cards as MemoryCard[])
  const firstCard = cards.find((card) => card.id === firstCardId)
  const secondCard = cards.find((card) => card.id === secondCardId)

  if (!firstCard || !secondCard) {
    throw new Error('Expected cards to exist')
  }

  return [firstCard.value, secondCard.value]
}

describe('MemoryBot', () => {
  const originalBotUxDelayMs = process.env.BOT_UX_DELAY_MS

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalBotUxDelayMs === undefined) {
      delete process.env.BOT_UX_DELAY_MS
    } else {
      process.env.BOT_UX_DELAY_MS = originalBotUxDelayMs
    }
  })

  it('hard difficulty does not recall a pair that nobody has turned', async () => {
    const game = createGame()
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0)

    const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()

    expect(decision.strategy).not.toBe('remembered-pair')
  })

  it('hard difficulty recalls a pair whose cards were both turned earlier', async () => {
    const game = createGame(0, boardOfPairs(['A', 'B', 'C', 'D']))
    missPair(game, HUMAN, 'a1', 'b1')
    missPair(game, BOT, 'a2', 'c1')
    missPair(game, HUMAN, 'c2', 'd1')
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0.99)

    const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()
    const [firstValue, secondValue] = valuesForDecision(game, decision.firstCardId, decision.secondCardId)

    expect(decision.strategy).toBe('remembered-pair')
    expect(firstValue).toBe(secondValue)
    expect(['b2', 'd2']).not.toContain(decision.firstCardId)
    expect(['b2', 'd2']).not.toContain(decision.secondCardId)
  })

  it('remembers turned cards after the state is saved and restored', async () => {
    const played = createGame(0, boardOfPairs(['A', 'B', 'C']))
    missPair(played, HUMAN, 'a1', 'b1')
    missPair(played, BOT, 'a2', 'c1')
    missPair(played, HUMAN, 'b2', 'c2')

    const restored = new MemoryGame('memory-bot-test')
    restored.restoreState(JSON.parse(JSON.stringify(played.getState())))
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0)

    const decision = await new MemoryBot(restored, 'hard', BOT.id).makeDecision()
    const [firstValue, secondValue] = valuesForDecision(restored, decision.firstCardId, decision.secondCardId)

    expect(decision.strategy).toBe('remembered-pair')
    expect(firstValue).toBe(secondValue)
  })

  it('hard difficulty finds pairs on a fresh board only as often as a guess would', async () => {
    const values = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const trials = 400
    let matches = 0

    for (let trial = 0; trial < trials; trial += 1) {
      const game = createGame(1, boardOfPairs(values))
      const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()
      const [firstValue, secondValue] = valuesForDecision(game, decision.firstCardId, decision.secondCardId)
      if (firstValue === secondValue) matches += 1
    }

    // A blind pick on 16 cards matches 1 time in 15.
    expect(matches / trials).toBeLessThan(0.2)
  })

  it('hard difficulty does not recall the mate of a face-up card when the mate was never turned', async () => {
    const game = createGame()
    flip(game, BOT, 'a1')
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0.99)

    const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()

    expect(decision.firstCardId).toBe('a1')
    expect(decision.strategy).not.toBe('remembered-mate')
  })

  it('hard difficulty picks a never-turned mate only as often as a guess would', async () => {
    const values = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const trials = 400
    let mates = 0

    for (let trial = 0; trial < trials; trial += 1) {
      const game = createGame(1, boardOfPairs(values))
      flip(game, BOT, 'a1')
      const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()
      if (decision.secondCardId === 'a2') mates += 1
    }

    // 15 face-down cards are left, so a blind pick finds the mate 1 time in 15.
    expect(mates / trials).toBeLessThan(0.2)
  })

  it('hard difficulty recalls the mate of a face-up card when the mate was turned earlier', async () => {
    const game = createGame(0, boardOfPairs(['A', 'B', 'C']))
    missPair(game, HUMAN, 'a2', 'b1')
    flip(game, BOT, 'a1')
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValue(0)

    const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()

    expect(decision.strategy).toBe('remembered-mate')
    expect(decision.secondCardId).toBe('a2')
  })

  it('hard difficulty still has a chance to make a non-matching mistake', async () => {
    const game = createGame(0)
    missPair(game, HUMAN, 'a1', 'b1')
    jest.spyOn(Math, 'random').mockReturnValue(0.01)

    const decision = await new MemoryBot(game, 'hard', BOT.id).makeDecision()
    const [firstValue, secondValue] = valuesForDecision(game, decision.firstCardId, decision.secondCardId)

    expect(decision.strategy).toBe('mistake')
    expect(firstValue).not.toBe(secondValue)
  })

  it('is available through the shared bot factory', () => {
    const game = createGame()

    expect(createBot('memory', game, 'medium')).toBeInstanceOf(MemoryBot)
  })

  it('continues a bot turn through mismatch resolution', async () => {
    process.env.BOT_UX_DELAY_MS = '0'
    const game = createGame(0)
    missPair(game, HUMAN, 'a1', 'b1')
    jest.spyOn(Math, 'random').mockReturnValue(0.01)
    const moves: Move[] = []

    await executeBotTurn(
      'memory',
      game,
      BOT.id,
      'hard',
      async (move) => {
        moves.push(move)
        expect(game.makeMove(move)).toBe(true)
      },
    )

    const data = game.getState().data as MemoryGameData
    expect(moves.map((move) => move.type)).toEqual(['flip', 'flip', 'resolve-mismatch'])
    expect(data.pendingMismatchCardIds).toEqual([])
    expect(game.getState().currentPlayerIndex).toBe(0)
  })
})
