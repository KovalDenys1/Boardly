import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type MemoryDifficulty = 'easy' | 'medium' | 'hard'

export interface MemoryCard {
  id: string
  value: string
  isMatched: boolean
  isFlipped: boolean
}

export interface MemoryGameData {
  difficulty: MemoryDifficulty
  gridColumns: number
  gridRows: number
  cards: MemoryCard[]
  flippedCardIds: string[]
  pendingMismatchCardIds: string[]
  scores: Record<string, number>
  winnerId: string | null
  advanceTurnAfterMove: boolean
}

interface MemoryGridConfig {
  columns: number
  rows: number
  pairs: number
}

const GRID_BY_DIFFICULTY: Record<MemoryDifficulty, MemoryGridConfig> = {
  easy: { columns: 4, rows: 4, pairs: 8 },
  medium: { columns: 5, rows: 4, pairs: 10 },
  hard: { columns: 6, rows: 6, pairs: 18 },
}

const CARD_SYMBOLS = [
  '🍎', '🍊', '🍋', '🍌', '🍇', '🍓', '🍒', '🥝',
  '🥥', '🍑', '🍐', '🍉', '🥭', '🍍', '🥑', '🫐',
  '🍈', '🍏',
]

export class MemoryGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 4, minPlayers: 2 }) {
    super(gameId, 'memory', config)
  }

  getInitialGameData(): MemoryGameData {
    const difficulty = this.resolveDifficulty()
    const grid = GRID_BY_DIFFICULTY[difficulty]

    return {
      difficulty,
      gridColumns: grid.columns,
      gridRows: grid.rows,
      cards: this.generateCards(grid.pairs),
      flippedCardIds: [],
      pendingMismatchCardIds: [],
      scores: {},
      winnerId: null,
      advanceTurnAfterMove: false,
    }
  }

  startGame(): boolean {
    const started = super.startGame()
    if (!started) {
      return false
    }

    const data = this.state.data as MemoryGameData
    data.scores = {}
    for (const player of this.state.players) {
      data.scores[player.id] = 0
      player.score = 0
    }

    data.winnerId = null
    data.flippedCardIds = []
    data.pendingMismatchCardIds = []
    data.advanceTurnAfterMove = false
    return true
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as MemoryGameData
    if (this.state.status !== 'playing') {
      return false
    }

    const currentPlayer = this.state.players[this.state.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== move.playerId) {
      return false
    }

    if (move.type === 'resolve-mismatch') {
      return data.pendingMismatchCardIds.length === 2
    }

    if (move.type !== 'flip') {
      return false
    }

    if (data.pendingMismatchCardIds.length > 0 || data.flippedCardIds.length >= 2) {
      return false
    }

    const { cardId } = move.data as { cardId?: unknown }
    if (typeof cardId !== 'string' || cardId.length === 0) {
      return false
    }

    const card = data.cards.find((entry) => entry.id === cardId)
    if (!card) {
      return false
    }

    if (card.isMatched || card.isFlipped) {
      return false
    }

    return true
  }

  processMove(move: Move): void {
    const data = this.state.data as MemoryGameData
    data.advanceTurnAfterMove = false

    if (move.type === 'resolve-mismatch') {
      for (const cardId of data.pendingMismatchCardIds) {
        const card = data.cards.find((entry) => entry.id === cardId)
        if (card) {
          card.isFlipped = false
        }
      }
      data.pendingMismatchCardIds = []
      data.flippedCardIds = []
      data.advanceTurnAfterMove = true
      return
    }

    const { cardId } = move.data as { cardId: string }
    const selectedCard = data.cards.find((entry) => entry.id === cardId)
    if (!selectedCard) {
      return
    }

    selectedCard.isFlipped = true
    data.flippedCardIds.push(selectedCard.id)

    if (data.flippedCardIds.length < 2) {
      return
    }

    const [firstCardId, secondCardId] = data.flippedCardIds
    const firstCard = data.cards.find((entry) => entry.id === firstCardId)
    const secondCard = data.cards.find((entry) => entry.id === secondCardId)
    if (!firstCard || !secondCard) {
      return
    }

    if (firstCard.value === secondCard.value) {
      firstCard.isMatched = true
      secondCard.isMatched = true
      data.flippedCardIds = []

      const nextScore = (data.scores[move.playerId] ?? 0) + 1
      data.scores[move.playerId] = nextScore
      const player = this.state.players.find((entry) => entry.id === move.playerId)
      if (player) {
        player.score = nextScore
      }

      if (data.cards.every((card) => card.isMatched)) {
        data.winnerId = this.resolveWinnerId(data)
        this.state.status = 'finished'
        this.state.winner = data.winnerId ?? undefined
      }
      return
    }

    data.pendingMismatchCardIds = [firstCard.id, secondCard.id]
  }

  checkWinCondition(): Player | null {
    const data = this.state.data as MemoryGameData
    if (this.state.status !== 'finished' || !data.winnerId) {
      return null
    }

    return this.state.players.find((player) => player.id === data.winnerId) || null
  }

  getGameRules(): string[] {
    return [
      'Players take turns flipping two cards',
      'Matching cards stay revealed and score a point',
      'If cards do not match, they flip back and turn passes',
      'Player with the most matched pairs wins',
    ]
  }

  protected shouldAdvanceTurn(move: Move): boolean {
    const data = this.state.data as MemoryGameData
    if (this.state.status !== 'playing') {
      return false
    }

    if (move.type === 'resolve-mismatch' && data.advanceTurnAfterMove) {
      data.advanceTurnAfterMove = false
      return true
    }

    return false
  }

  private resolveDifficulty(): MemoryDifficulty {
    const rawDifficulty = (this.config.rules as { difficulty?: unknown } | undefined)?.difficulty
    if (rawDifficulty === 'easy' || rawDifficulty === 'medium' || rawDifficulty === 'hard') {
      return rawDifficulty
    }
    return 'easy'
  }

  private generateCards(pairCount: number): MemoryCard[] {
    const symbols = CARD_SYMBOLS.slice(0, pairCount)
    const allValues = [...symbols, ...symbols]
    this.shuffleValues(allValues)

    return allValues.map((value, index) => ({
      id: `card-${index}`,
      value,
      isMatched: false,
      isFlipped: false,
    }))
  }

  private shuffleValues(values: string[]) {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[values[index], values[swapIndex]] = [values[swapIndex], values[index]]
    }
  }

  private resolveWinnerId(data: MemoryGameData): string | null {
    let highestScore = -1
    let winnerId: string | null = null
    let tie = false

    for (const player of this.state.players) {
      const score = data.scores[player.id] ?? 0
      if (score > highestScore) {
        highestScore = score
        winnerId = player.id
        tie = false
      } else if (score === highestScore) {
        tie = true
      }
    }

    return tie ? null : winnerId
  }
}
