import {
  RockPaperScissorsGame,
  RockPaperScissorsGameData,
} from '@/lib/games/rock-paper-scissors-game'
import { RockPaperScissorsBot } from '@/lib/bots/rock-paper-scissors/rock-paper-scissors-bot'

function createGame(): RockPaperScissorsGame {
  const game = new RockPaperScissorsGame('rps-bot-test')
  game.addPlayer({ id: 'human', name: 'Human' })
  game.addPlayer({ id: 'bot', name: 'AI Bot' })
  game.startGame()
  return game
}

function setRounds(game: RockPaperScissorsGame, rounds: RockPaperScissorsGameData['rounds']) {
  const state = game.getState()
  const data = state.data as RockPaperScissorsGameData

  const nextState = {
    ...state,
    data: {
      ...data,
      rounds,
      playersReady: [],
      playerChoices: {
        human: null,
        bot: null,
      },
      scores: {
        human: 0,
        bot: 0,
      },
    },
  }

  game.restoreState(nextState)
}

describe('RockPaperScissorsBot', () => {
  it('easy difficulty returns a valid choice', async () => {
    const game = createGame()
    const bot = new RockPaperScissorsBot(game, 'easy', 'bot')
    const decision = await bot.makeDecision()

    expect(['rock', 'paper', 'scissors']).toContain(decision.choice)
  })

  it('hard difficulty counters the most frequent opponent pattern', async () => {
    const game = createGame()
    setRounds(game, [
      {
        choices: { human: 'rock', bot: 'scissors' },
        winner: 'human',
      },
      {
        choices: { human: 'paper', bot: 'scissors' },
        winner: 'bot',
      },
      {
        choices: { human: 'rock', bot: 'paper' },
        winner: 'bot',
      },
    ])

    const bot = new RockPaperScissorsBot(game, 'hard', 'bot')
    const decision = await bot.makeDecision()

    // Opponent favors rock in history, so hard bot should counter with paper.
    expect(decision.choice).toBe('paper')
  })

  it('decisionToMove uses configured bot user id', () => {
    const game = createGame()
    const bot = new RockPaperScissorsBot(game, 'medium', 'bot')

    const move = bot.decisionToMove({
      type: 'submit-choice',
      choice: 'scissors',
    })

    expect(move.playerId).toBe('bot')
    expect(move.type).toBe('submit-choice')
    expect(move.data).toEqual({ choice: 'scissors' })
  })

  it('decisionToMove throws when bot user id is missing', () => {
    const game = createGame()
    const bot = new RockPaperScissorsBot(game, 'medium')

    expect(() =>
      bot.decisionToMove({
        type: 'submit-choice',
        choice: 'rock',
      }),
    ).toThrow('Bot user id is missing for Rock Paper Scissors move')
  })
})
