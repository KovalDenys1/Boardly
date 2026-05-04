import { Move } from '@/lib/game-engine'
import { MemoryCard, MemoryGame, MemoryGameData } from '@/lib/games/memory-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export interface MemoryBotDecision {
  type: 'flip-pair'
  firstCardId: string
  secondCardId: string
  firstCardAlreadyFlipped: boolean
  strategy: 'remembered-pair' | 'remembered-mate' | 'guess' | 'mistake'
}

interface MemoryBotProfile {
  pairRecallChance: number
  mateRecallChance: number
  mistakeChance: number
}

const MEMORY_BOT_PROFILES: Record<BotDifficulty, MemoryBotProfile> = {
  easy: {
    pairRecallChance: 0.18,
    mateRecallChance: 0.22,
    mistakeChance: 0.48,
  },
  medium: {
    pairRecallChance: 0.58,
    mateRecallChance: 0.62,
    mistakeChance: 0.24,
  },
  hard: {
    pairRecallChance: 0.88,
    mateRecallChance: 0.86,
    mistakeChance: 0.12,
  },
}

export class MemoryBot extends BaseBot<MemoryGame, MemoryBotDecision> {
  private botUserId: string | null

  constructor(
    gameEngine: MemoryGame,
    difficulty: BotDifficulty = 'medium',
    botUserId?: string,
  ) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  setBotUserId(botUserId: string) {
    this.botUserId = botUserId
  }

  async makeDecision(): Promise<MemoryBotDecision> {
    const gameData = this.gameEngine.getState().data as MemoryGameData
    const profile = MEMORY_BOT_PROFILES[this.config.difficulty]
    const visibleCards = gameData.cards.filter((card) => card.isFlipped && !card.isMatched)
    const hiddenCards = gameData.cards.filter((card) => !card.isFlipped && !card.isMatched)

    if (visibleCards.length === 1) {
      const firstCard = visibleCards[0]
      const secondCard = this.pickSecondCard(firstCard, hiddenCards, profile)

      return {
        type: 'flip-pair',
        firstCardId: firstCard.id,
        secondCardId: secondCard.card.id,
        firstCardAlreadyFlipped: true,
        strategy: secondCard.strategy,
      }
    }

    if (hiddenCards.length < 2) {
      throw new Error('No available Memory cards for bot move')
    }

    const pairDecision = this.pickPair(hiddenCards, profile)
    return {
      type: 'flip-pair',
      firstCardId: pairDecision.first.id,
      secondCardId: pairDecision.second.id,
      firstCardAlreadyFlipped: false,
      strategy: pairDecision.strategy,
    }
  }

  decisionToMove(decision: MemoryBotDecision): Move {
    const cardId = decision.firstCardAlreadyFlipped ? decision.secondCardId : decision.firstCardId
    return this.createFlipMove(cardId)
  }

  decisionToSecondMove(decision: MemoryBotDecision): Move {
    return this.createFlipMove(decision.secondCardId)
  }

  createResolveMismatchMove(): Move {
    const playerId = this.resolveBotPlayerId()
    return {
      playerId,
      type: 'resolve-mismatch',
      data: {},
      timestamp: new Date(),
    }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const gameData = state.data as MemoryGameData
    const matchedPairs = gameData.cards.filter((card) => card.isMatched).length / 2
    return `Memory turn=${state.currentPlayerIndex} matchedPairs=${matchedPairs} pendingMismatch=${gameData.pendingMismatchCardIds.length}`
  }

  private pickPair(
    hiddenCards: MemoryCard[],
    profile: MemoryBotProfile,
  ): { first: MemoryCard; second: MemoryCard; strategy: MemoryBotDecision['strategy'] } {
    const pairs = this.findHiddenPairs(hiddenCards)
    const shouldMakeMistake = Math.random() < profile.mistakeChance
    const shouldRecallPair = !shouldMakeMistake && pairs.length > 0 && Math.random() < profile.pairRecallChance

    if (shouldRecallPair) {
      const pair = this.pickRandom(pairs)
      return {
        first: pair[0],
        second: pair[1],
        strategy: 'remembered-pair',
      }
    }

    if (shouldMakeMistake) {
      const nonMatchingPair = this.pickNonMatchingPair(hiddenCards)
      if (nonMatchingPair) {
        return {
          first: nonMatchingPair[0],
          second: nonMatchingPair[1],
          strategy: 'mistake',
        }
      }
    }

    const [first, second] = this.pickRandomPair(hiddenCards)
    return {
      first,
      second,
      strategy: 'guess',
    }
  }

  private pickSecondCard(
    firstCard: MemoryCard,
    hiddenCards: MemoryCard[],
    profile: MemoryBotProfile,
  ): { card: MemoryCard; strategy: MemoryBotDecision['strategy'] } {
    if (hiddenCards.length === 0) {
      throw new Error('No hidden Memory cards available for bot move')
    }

    const matchingMates = hiddenCards.filter((card) => card.value === firstCard.value)
    const shouldMakeMistake = Math.random() < profile.mistakeChance
    const shouldRecallMate = !shouldMakeMistake && matchingMates.length > 0 && Math.random() < profile.mateRecallChance

    if (shouldRecallMate) {
      return {
        card: this.pickRandom(matchingMates),
        strategy: 'remembered-mate',
      }
    }

    if (shouldMakeMistake) {
      const nonMatchingCards = hiddenCards.filter((card) => card.value !== firstCard.value)
      if (nonMatchingCards.length > 0) {
        return {
          card: this.pickRandom(nonMatchingCards),
          strategy: 'mistake',
        }
      }
    }

    return {
      card: this.pickRandom(hiddenCards),
      strategy: 'guess',
    }
  }

  private findHiddenPairs(hiddenCards: MemoryCard[]): Array<[MemoryCard, MemoryCard]> {
    const cardsByValue = new Map<string, MemoryCard[]>()
    for (const card of hiddenCards) {
      const group = cardsByValue.get(card.value) ?? []
      group.push(card)
      cardsByValue.set(card.value, group)
    }

    return Array.from(cardsByValue.values())
      .filter((cards) => cards.length >= 2)
      .map((cards) => [cards[0], cards[1]])
  }

  private pickNonMatchingPair(cards: MemoryCard[]): [MemoryCard, MemoryCard] | null {
    const shuffled = this.shuffle(cards)
    for (let index = 0; index < shuffled.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < shuffled.length; nextIndex += 1) {
        if (shuffled[index].value !== shuffled[nextIndex].value) {
          return [shuffled[index], shuffled[nextIndex]]
        }
      }
    }
    return null
  }

  private pickRandomPair(cards: MemoryCard[]): [MemoryCard, MemoryCard] {
    const firstIndex = Math.floor(Math.random() * cards.length)
    let secondIndex = Math.floor(Math.random() * (cards.length - 1))
    if (secondIndex >= firstIndex) {
      secondIndex += 1
    }

    return [cards[firstIndex], cards[secondIndex]]
  }

  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
    }
    return shuffled
  }

  private createFlipMove(cardId: string): Move {
    const playerId = this.resolveBotPlayerId()
    return {
      playerId,
      type: 'flip',
      data: { cardId },
      timestamp: new Date(),
    }
  }

  private resolveBotPlayerId(): string {
    const playerId = this.botUserId || this.gameEngine.getCurrentPlayer()?.id
    if (!playerId) {
      throw new Error('Unable to resolve bot player id for Memory move')
    }
    return playerId
  }
}
