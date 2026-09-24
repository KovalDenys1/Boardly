import { YahtzeeBot } from '@/lib/bots/yahtzee/yahtzee-bot'
import { YahtzeeBotAI } from '@/lib/bots/yahtzee/yahtzee-bot-ai'
import type { YahtzeeGame } from '@/lib/games/yahtzee-game'

/**
 * #1191: a bot that decided to keep all five dice sent a roll the engine
 * rejects as a no-op, retried it on every tick, and the game never finished.
 */
describe('YahtzeeBot all-held decision (#1191)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('scores instead of rolling when it would hold every die', async () => {
    const engine = {
      getRollsLeft: () => 1,
      getDice: () => [2, 3, 4, 5, 6],
      getHeld: () => [true, true, true, true, true],
      getCurrentPlayer: () => ({ id: 'bot-1', name: 'Bot' }),
      getMode: () => 'classic',
      getScorecard: () => ({ largeStraight: 40 }),
    } as unknown as YahtzeeGame
    const bot = new YahtzeeBot(engine, 'medium')
    jest.spyOn(YahtzeeBotAI, 'decideDiceToHold').mockReturnValue([0, 1, 2, 3, 4])
    jest.spyOn(bot as unknown as { shouldScore: () => boolean }, 'shouldScore').mockReturnValue(false)

    const decision = await bot.makeDecision()
    expect(decision.type).toBe('score')
    expect(decision.category).toBeDefined()
  })
})
