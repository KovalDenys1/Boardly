/**
 * Yahtzee Bot - extends BaseBot with Yahtzee-specific AI logic
 * Implements probability-based decision making for Yahtzee game
 */

import { BaseBot } from '../core/base-bot'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { BotDifficulty } from '../core/bot-types'
import { YahtzeeCategory, calculateScore, YahtzeeScorecard } from '@/lib/yahtzee'
import { YahtzeeBotAI } from './yahtzee-bot-ai'

export interface YahtzeeBotDecision {
    type: 'roll' | 'hold' | 'score'
    diceToHold?: number[]
    category?: YahtzeeCategory
}

/**
 * Yahtzee Bot implementation
 */
export class YahtzeeBot extends BaseBot<YahtzeeGame, YahtzeeBotDecision> {
    constructor(gameEngine: YahtzeeGame, difficulty: BotDifficulty = 'medium') {
        super(gameEngine, difficulty)
    }

    /**
     * Make decision for current game state
     */
    async makeDecision(): Promise<YahtzeeBotDecision> {
        const rollsLeft = this.gameEngine.getRollsLeft()
        const dice = this.gameEngine.getDice()
        const held = this.gameEngine.getHeld()
        const currentPlayer = this.gameEngine.getCurrentPlayer()

        if (!currentPlayer) {
            throw new Error('No current player')
        }

        const scorecard = this.gameEngine.getScorecard(currentPlayer.id)
        if (!scorecard) {
            throw new Error('No scorecard found for bot')
        }

        // If no rolls left, must score
        if (rollsLeft === 0) {
            const category = YahtzeeBotAI.selectCategory(dice, scorecard)
            return {
                type: 'score',
                category,
            }
        }

        // If first roll (rollsLeft === 3), always roll
        if (rollsLeft === 3) {
            return {
                type: 'roll',
                diceToHold: [],
            }
        }

        // For second/third roll, decide whether to roll again or score
        // Calculate expected value of rolling vs scoring now
        const bestCategory = YahtzeeBotAI.selectCategory(dice, scorecard)
        const currentScore = calculateScore(dice, bestCategory)

        // Simple heuristic: if score is good enough, take it; otherwise roll
        const shouldScore = this.shouldScore(currentScore, rollsLeft, scorecard)

        if (shouldScore) {
            return {
                type: 'score',
                category: bestCategory,
            }
        }

        // Roll again, but hold promising dice
        const diceToHold = YahtzeeBotAI.decideDiceToHold(dice, held, rollsLeft, scorecard)
        return {
            type: 'roll',
            diceToHold,
        }
    }

    /**
     * Convert decision to game move
     */
    decisionToMove(decision: YahtzeeBotDecision): Move {
        const currentPlayer = this.gameEngine.getCurrentPlayer()
        if (!currentPlayer) {
            throw new Error('No current player')
        }

        switch (decision.type) {
            case 'roll': {
                const held = [false, false, false, false, false]
                if (decision.diceToHold) {
                    for (const index of decision.diceToHold) {
                        held[index] = true
                    }
                }
                return {
                    playerId: currentPlayer.id,
                    type: 'roll',
                    data: { held },
                    timestamp: new Date(),
                }
            }

            case 'score': {
                if (!decision.category) {
                    throw new Error('Category required for score decision')
                }
                return {
                    playerId: currentPlayer.id,
                    type: 'score',
                    data: { category: decision.category },
                    timestamp: new Date(),
                }
            }

            default:
                throw new Error(`Unknown decision type: ${(decision as any).type}`)
        }
    }

    /**
     * Evaluate current state
     */
    evaluateState(): string {
        const currentPlayer = this.gameEngine.getCurrentPlayer()
        const dice = this.gameEngine.getDice()
        const rollsLeft = this.gameEngine.getRollsLeft()

        return `Player: ${currentPlayer?.name}, Dice: [${dice.join(', ')}], Rolls left: ${rollsLeft}`
    }

    /**
     * Decide whether to score now or roll again
     */
    private shouldScore(
        currentScore: number,
        rollsLeft: number,
        scorecard: YahtzeeScorecard | Record<string, number>
    ): boolean {
        // Adjust thresholds based on difficulty
        const thresholds = {
            easy: { roll2: 15, roll1: 10 },
            medium: { roll2: 20, roll1: 15 },
            hard: { roll2: 25, roll1: 20 },
        }

        const threshold = thresholds[this.config.difficulty]

        // On last roll, always score
        if (rollsLeft === 1) {
            return currentScore >= threshold.roll1
        }

        // On second roll
        if (rollsLeft === 2) {
            return currentScore >= threshold.roll2
        }

        return false
    }
}
