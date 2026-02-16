import { Move } from '@/lib/game-engine'
import {
  RockPaperScissorsGame,
  RockPaperScissorsGameData,
  RPSChoice,
} from '@/lib/games/rock-paper-scissors-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export interface RockPaperScissorsBotDecision {
  type: 'submit-choice'
  choice: RPSChoice
}

const RPS_CHOICES: RPSChoice[] = ['rock', 'paper', 'scissors']

export class RockPaperScissorsBot extends BaseBot<
  RockPaperScissorsGame,
  RockPaperScissorsBotDecision
> {
  private botUserId: string | null

  constructor(
    gameEngine: RockPaperScissorsGame,
    difficulty: BotDifficulty = 'medium',
    botUserId?: string,
  ) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  setBotUserId(botUserId: string) {
    this.botUserId = botUserId
  }

  async makeDecision(): Promise<RockPaperScissorsBotDecision> {
    const gameData = this.gameEngine.getState().data as RockPaperScissorsGameData
    const botUserId = this.botUserId

    if (!botUserId) {
      throw new Error('Bot user id is required for Rock Paper Scissors bot decisions')
    }

    const opponentId = this.getOpponentId(botUserId)
    if (!opponentId) {
      return {
        type: 'submit-choice',
        choice: this.getRandomChoice(),
      }
    }

    if (this.config.difficulty === 'easy') {
      return {
        type: 'submit-choice',
        choice: this.getRandomChoice(),
      }
    }

    const predictedOpponentChoice = this.predictOpponentChoice(gameData, opponentId)

    if (!predictedOpponentChoice) {
      return {
        type: 'submit-choice',
        choice: this.getRandomChoice(),
      }
    }

    if (this.config.difficulty === 'medium') {
      const shouldCounterPrediction = Math.random() < 0.7
      return {
        type: 'submit-choice',
        choice: shouldCounterPrediction
          ? this.getCounterChoice(predictedOpponentChoice)
          : this.getRandomChoice(),
      }
    }

    return {
      type: 'submit-choice',
      choice: this.getCounterChoice(predictedOpponentChoice),
    }
  }

  decisionToMove(decision: RockPaperScissorsBotDecision): Move {
    if (!this.botUserId) {
      throw new Error('Bot user id is missing for Rock Paper Scissors move')
    }

    return {
      playerId: this.botUserId,
      type: 'submit-choice',
      data: {
        choice: decision.choice,
      },
      timestamp: new Date(),
    }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const gameData = state.data as RockPaperScissorsGameData
    return `RPS rounds=${gameData.rounds.length} playersReady=${gameData.playersReady.length} status=${state.status}`
  }

  private predictOpponentChoice(
    gameData: RockPaperScissorsGameData,
    opponentId: string,
  ): RPSChoice | null {
    if (!Array.isArray(gameData.rounds) || gameData.rounds.length === 0) {
      return null
    }

    const counts: Record<RPSChoice, number> = {
      rock: 0,
      paper: 0,
      scissors: 0,
    }

    for (const round of gameData.rounds) {
      const choice = round.choices?.[opponentId] as RPSChoice | undefined
      if (choice && choice in counts) {
        counts[choice] += 1
      }
    }

    const lastRound = gameData.rounds[gameData.rounds.length - 1]
    const lastChoice = lastRound?.choices?.[opponentId] as RPSChoice | undefined
    if (lastChoice && lastChoice in counts) {
      counts[lastChoice] += 1
    }

    const maxCount = Math.max(...Object.values(counts))
    if (maxCount <= 0) {
      return null
    }

    const topChoices = (Object.keys(counts) as RPSChoice[]).filter(
      (choice) => counts[choice] === maxCount,
    )
    return topChoices[Math.floor(Math.random() * topChoices.length)] ?? null
  }

  private getCounterChoice(choice: RPSChoice): RPSChoice {
    if (choice === 'rock') return 'paper'
    if (choice === 'paper') return 'scissors'
    return 'rock'
  }

  private getRandomChoice(): RPSChoice {
    return RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)]
  }

  private getOpponentId(botUserId: string): string | null {
    const players = this.gameEngine.getPlayers()
    const opponent = players.find((player) => player.id !== botUserId)
    return opponent?.id ?? null
  }
}
