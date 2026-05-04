import { Move, Player } from '@/lib/game-engine'
import { createBot, executeBotTurn } from '@/lib/bots'
import { MemoryBot } from '@/lib/bots/memory/memory-bot'
import { MemoryCard, MemoryGame, MemoryGameData } from '@/lib/games/memory-game'

const HUMAN: Player = { id: 'human', name: 'Human' }
const BOT: Player = { id: 'bot', name: 'Memory Bot' }

function createGame(currentPlayerIndex = 1): MemoryGame {
  const game = new MemoryGame('memory-bot-test')
  game.addPlayer(HUMAN)
  game.addPlayer(BOT)
  game.startGame()

  const state = game.getState()
  state.currentPlayerIndex = currentPlayerIndex
  const data = state.data as MemoryGameData
  data.cards = [
    { id: 'a1', value: 'A', isMatched: false, isFlipped: false },
    { id: 'a2', value: 'A', isMatched: false, isFlipped: false },
    { id: 'b1', value: 'B', isMatched: false, isFlipped: false },
    { id: 'b2', value: 'B', isMatched: false, isFlipped: false },
  ]
  data.flippedCardIds = []
  data.pendingMismatchCardIds = []
  data.scores = {
    [HUMAN.id]: 0,
    [BOT.id]: 0,
  }
  game.restoreState(state)

  return game
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

  it('hard difficulty recalls a known pair most of the time', async () => {
    const game = createGame()
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0)

    const bot = new MemoryBot(game, 'hard', BOT.id)
    const decision = await bot.makeDecision()
    const [firstValue, secondValue] = valuesForDecision(game, decision.firstCardId, decision.secondCardId)

    expect(decision.strategy).toBe('remembered-pair')
    expect(firstValue).toBe(secondValue)
  })

  it('hard difficulty still has a chance to make a non-matching mistake', async () => {
    const game = createGame()
    jest.spyOn(Math, 'random').mockReturnValue(0.01)

    const bot = new MemoryBot(game, 'hard', BOT.id)
    const decision = await bot.makeDecision()
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
    const game = createGame()
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
