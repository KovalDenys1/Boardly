import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type SketchAndGuessPhase = 'drawing' | 'guessing' | 'reveal'

export interface SketchAndGuessGuess {
  playerId: string
  guess: string
  submittedAt: number
  isCorrect: boolean
  autoSubmitted?: boolean
}

export interface SketchAndGuessRound {
  round: number
  drawerId: string
  prompt: string
  drawingContent: string | null
  drawingSubmittedAt: number | null
  drawingAutoSubmitted: boolean
  guesses: SketchAndGuessGuess[]
  revealAt: number | null
  isScored: boolean
  scoredAt: number | null
}

export interface SketchAndGuessScoreBreakdown {
  correctGuesses: number
  drawerRoundsWithCorrectGuesses: number
  guessPoints: number
  drawerPoints: number
  autoSubmissionPenalty: number
  finalScore: number
}

export interface SketchAndGuessGameData {
  phase: SketchAndGuessPhase
  currentRound: number
  totalRounds: number
  drawerOrder: string[]
  currentDrawerId: string
  rounds: SketchAndGuessRound[]
  submittedPlayerIds: string[]
  scores: Record<string, number>
  scoreBreakdown: Record<string, SketchAndGuessScoreBreakdown>
  winnerId: string | null
  ranking: string[]
  completionReason: 'all-rounds-finished' | null
  finishedAt: number | null
  isMvpScaffold: boolean
}

export interface SketchAndGuessTimeoutResolution {
  changed: boolean
  timeoutWindowsConsumed: number
  phaseTransitions: number
  revealAdvances: number
  autoSubmittedDrawings: number
  autoSubmittedGuesses: number
  autoSubmittedPlayerIds: string[]
}

const DEFAULT_TOTAL_ROUNDS = 3
const MIN_TOTAL_ROUNDS = 1
const MAX_TOTAL_ROUNDS = 10
const MIN_DRAWING_CONTENT_LENGTH = 3
const MAX_DRAWING_CONTENT_LENGTH = 120_000
const MIN_GUESS_LENGTH = 2
const MAX_GUESS_LENGTH = 80
const SKETCH_TIMEOUT_FALLBACK_MAX_ITERATIONS = 256

const SCORE_CORRECT_GUESS_POINTS = 100
const SCORE_FIRST_CORRECT_BONUS = 20
const SCORE_DRAWER_PER_CORRECT_GUESS = 40
const SCORE_AUTO_DRAWING_PENALTY = 20
const SCORE_AUTO_GUESS_PENALTY = 10

const PROMPT_POOL = [
  'castle',
  'spaceship',
  'volcano',
  'pirate',
  'robot',
  'dragon',
  'island',
  'unicorn',
  'sheriff',
  'treasure',
  'jungle',
  'rainbow',
  'thunder',
  'mermaid',
  'tornado',
  'piano',
  'astronaut',
  'whale',
  'viking',
  'waterfall',
  'carnival',
  'skateboard',
  'mountain',
  'submarine',
  'fireworks',
]

export class SketchAndGuessGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 10, minPlayers: 3 }) {
    super(gameId, 'sketch_and_guess', config)
  }

  getInitialGameData(): SketchAndGuessGameData {
    return {
      phase: 'drawing',
      currentRound: 1,
      totalRounds: this.resolveTotalRounds(),
      drawerOrder: [],
      currentDrawerId: '',
      rounds: [],
      submittedPlayerIds: [],
      scores: {},
      scoreBreakdown: {},
      winnerId: null,
      ranking: [],
      completionReason: null,
      finishedAt: null,
      isMvpScaffold: true,
    }
  }

  startGame(): boolean {
    const started = super.startGame()
    if (!started) {
      return false
    }

    const data = this.state.data as SketchAndGuessGameData
    data.totalRounds = this.resolveTotalRounds()
    data.currentRound = 1
    data.drawerOrder = this.state.players.map((player) => player.id)
    data.currentDrawerId = this.resolveDrawerId(1, data.drawerOrder)
    data.phase = 'drawing'
    data.submittedPlayerIds = []
    data.rounds = [this.createRound(1, data.currentDrawerId)]
    data.scores = {}
    data.scoreBreakdown = {}
    data.winnerId = null
    data.ranking = []
    data.completionReason = null
    data.finishedAt = null
    this.recomputeScoreboard(data)
    return true
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as SketchAndGuessGameData
    if (this.state.status !== 'playing') {
      return false
    }

    const playerExists = this.state.players.some((player) => player.id === move.playerId)
    if (!playerExists) {
      return false
    }

    if (data.phase === 'drawing') {
      if (move.type !== 'submit-drawing' || move.playerId !== data.currentDrawerId) {
        return false
      }

      const currentRound = this.getCurrentRound(data)
      if (!currentRound || currentRound.drawingContent !== null) {
        return false
      }

      const content = this.getStringField(move.data, 'content')
      if (!content) {
        return false
      }
      const normalizedLength = content.trim().length
      return normalizedLength >= MIN_DRAWING_CONTENT_LENGTH && normalizedLength <= MAX_DRAWING_CONTENT_LENGTH
    }

    if (data.phase === 'guessing') {
      if (move.type !== 'submit-guess' || move.playerId === data.currentDrawerId) {
        return false
      }

      if (data.submittedPlayerIds.includes(move.playerId)) {
        return false
      }

      const currentRound = this.getCurrentRound(data)
      if (!currentRound) {
        return false
      }

      const guess = this.getStringField(move.data, 'guess')
      if (!guess) {
        return false
      }

      const normalizedLength = guess.trim().length
      return normalizedLength >= MIN_GUESS_LENGTH && normalizedLength <= MAX_GUESS_LENGTH
    }

    if (data.phase === 'reveal') {
      return move.type === 'advance-round'
    }

    return false
  }

  processMove(move: Move): void {
    const data = this.state.data as SketchAndGuessGameData
    const now = Date.now()

    if (data.phase === 'drawing' && move.type === 'submit-drawing') {
      const currentRound = this.getCurrentRound(data)
      const content = this.getStringField(move.data, 'content')
      if (!currentRound || !content) {
        return
      }

      currentRound.drawingContent = content.trim()
      currentRound.drawingSubmittedAt = now
      currentRound.drawingAutoSubmitted = false

      data.phase = 'guessing'
      data.submittedPlayerIds = []
      this.state.lastMoveAt = now
      return
    }

    if (data.phase === 'guessing' && move.type === 'submit-guess') {
      const currentRound = this.getCurrentRound(data)
      const guess = this.getStringField(move.data, 'guess')
      if (!currentRound || !guess) {
        return
      }

      const normalizedGuess = guess.trim()
      currentRound.guesses.push({
        playerId: move.playerId,
        guess: normalizedGuess,
        submittedAt: now,
        isCorrect: this.normalizeAnswer(normalizedGuess) === this.normalizeAnswer(currentRound.prompt),
      })
      data.submittedPlayerIds.push(move.playerId)

      if (data.submittedPlayerIds.length >= this.getExpectedGuesserCount(data)) {
        data.phase = 'reveal'
        data.submittedPlayerIds = []
        currentRound.revealAt = now
        this.state.lastMoveAt = now
      }
      return
    }

    if (data.phase === 'reveal' && move.type === 'advance-round') {
      this.advanceAfterReveal(data, now)
    }
  }

  checkWinCondition(): Player | null {
    if (this.state.status !== 'finished') {
      return null
    }

    const data = this.state.data as SketchAndGuessGameData
    if (!data.winnerId) {
      return null
    }

    return this.state.players.find((player) => player.id === data.winnerId) || null
  }

  getGameRules(): string[] {
    return [
      'A drawer receives a prompt and submits one drawing each round.',
      'All non-drawers submit one guess for the drawing.',
      'Correct guesses award points to guessers and bonus points to the drawer.',
      'Timeout auto-submissions are penalized.',
      'After all rounds are revealed, ranking is resolved deterministically.',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): SketchAndGuessTimeoutResolution {
    const result: SketchAndGuessTimeoutResolution = {
      changed: false,
      timeoutWindowsConsumed: 0,
      phaseTransitions: 0,
      revealAdvances: 0,
      autoSubmittedDrawings: 0,
      autoSubmittedGuesses: 0,
      autoSubmittedPlayerIds: [],
    }

    if (this.state.status !== 'playing') {
      return result
    }

    if (typeof turnTimerSeconds !== 'number' || !Number.isFinite(turnTimerSeconds) || turnTimerSeconds <= 0) {
      return result
    }

    const timeoutMs = Math.max(1, Math.floor(turnTimerSeconds * 1000))
    let phaseStartedAt =
      typeof this.state.lastMoveAt === 'number' && Number.isFinite(this.state.lastMoveAt)
        ? this.state.lastMoveAt
        : nowMs

    if (phaseStartedAt > nowMs) {
      phaseStartedAt = nowMs
    }

    let safetyCounter = 0
    while (
      this.state.status === 'playing' &&
      nowMs - phaseStartedAt >= timeoutMs &&
      safetyCounter < SKETCH_TIMEOUT_FALLBACK_MAX_ITERATIONS
    ) {
      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const data = this.state.data as SketchAndGuessGameData
      const currentRound = this.getCurrentRound(data)
      if (!currentRound) {
        break
      }

      if (data.phase === 'drawing') {
        if (!currentRound.drawingContent) {
          currentRound.drawingContent = this.buildTimeoutFallbackDrawing(currentRound.prompt)
          currentRound.drawingAutoSubmitted = true
          currentRound.drawingSubmittedAt = timeoutAt
          result.autoSubmittedDrawings += 1
          result.changed = true
          if (!result.autoSubmittedPlayerIds.includes(currentRound.drawerId)) {
            result.autoSubmittedPlayerIds.push(currentRound.drawerId)
          }
        }

        data.phase = 'guessing'
        data.submittedPlayerIds = []
        this.state.lastMoveAt = timeoutAt

        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.phaseTransitions += 1
        phaseStartedAt = timeoutAt
        continue
      }

      if (data.phase === 'guessing') {
        const autoSubmittedCount = this.autoSubmitMissingGuesses(data, currentRound, timeoutAt)
        if (autoSubmittedCount > 0) {
          result.changed = true
          result.autoSubmittedGuesses += autoSubmittedCount
        }

        data.phase = 'reveal'
        data.submittedPlayerIds = []
        currentRound.revealAt = currentRound.revealAt || timeoutAt
        this.state.lastMoveAt = timeoutAt

        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.phaseTransitions += 1
        phaseStartedAt = timeoutAt
        continue
      }

      if (data.phase === 'reveal') {
        this.advanceAfterReveal(data, timeoutAt)
        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.revealAdvances += 1
        phaseStartedAt = timeoutAt
        continue
      }

      break
    }

    return result
  }

  private autoSubmitMissingGuesses(
    data: SketchAndGuessGameData,
    round: SketchAndGuessRound,
    submittedAt: number,
  ): number {
    const submittedSet = new Set(round.guesses.map((guess) => guess.playerId))
    let created = 0

    for (const player of this.state.players) {
      if (player.id === round.drawerId || submittedSet.has(player.id)) {
        continue
      }

      round.guesses.push({
        playerId: player.id,
        guess: '[AUTO TIMEOUT]',
        submittedAt,
        isCorrect: false,
        autoSubmitted: true,
      })
      created += 1
      data.submittedPlayerIds.push(player.id)
      submittedSet.add(player.id)
    }

    return created
  }

  private advanceAfterReveal(data: SketchAndGuessGameData, nowMs: number): void {
    const currentRound = this.getCurrentRound(data)
    if (!currentRound) {
      return
    }

    if (!currentRound.isScored) {
      currentRound.isScored = true
      currentRound.scoredAt = nowMs
      this.recomputeScoreboard(data)
    }

    if (data.currentRound >= data.totalRounds) {
      this.finalizeGame(data, nowMs)
      return
    }

    data.currentRound += 1
    data.currentDrawerId = this.resolveDrawerId(data.currentRound, data.drawerOrder)
    data.phase = 'drawing'
    data.submittedPlayerIds = []
    data.rounds.push(this.createRound(data.currentRound, data.currentDrawerId))
    this.state.lastMoveAt = nowMs
  }

  private finalizeGame(data: SketchAndGuessGameData, nowMs: number): void {
    this.recomputeScoreboard(data)
    data.completionReason = 'all-rounds-finished'
    data.finishedAt = nowMs
    data.winnerId = data.ranking[0] || null
    this.state.status = 'finished'
    this.state.winner = data.winnerId ?? undefined
    this.state.lastMoveAt = nowMs
  }

  private recomputeScoreboard(data: SketchAndGuessGameData): void {
    const breakdownByPlayer = new Map<string, SketchAndGuessScoreBreakdown>()

    for (const player of this.state.players) {
      breakdownByPlayer.set(player.id, {
        correctGuesses: 0,
        drawerRoundsWithCorrectGuesses: 0,
        guessPoints: 0,
        drawerPoints: 0,
        autoSubmissionPenalty: 0,
        finalScore: 0,
      })
    }

    for (const round of data.rounds) {
      if (!round.isScored) {
        continue
      }

      const correctGuesses = round.guesses
        .filter((guess) => guess.isCorrect)
        .sort((left, right) => left.submittedAt - right.submittedAt)
      const firstCorrectGuesserId = correctGuesses[0]?.playerId || null

      if (round.drawingAutoSubmitted) {
        const drawerBreakdown = breakdownByPlayer.get(round.drawerId)
        if (drawerBreakdown) {
          drawerBreakdown.autoSubmissionPenalty += SCORE_AUTO_DRAWING_PENALTY
        }
      }

      if (correctGuesses.length > 0) {
        const drawerBreakdown = breakdownByPlayer.get(round.drawerId)
        if (drawerBreakdown) {
          drawerBreakdown.drawerRoundsWithCorrectGuesses += 1
          drawerBreakdown.drawerPoints += correctGuesses.length * SCORE_DRAWER_PER_CORRECT_GUESS
        }
      }

      for (const guess of round.guesses) {
        const guesserBreakdown = breakdownByPlayer.get(guess.playerId)
        if (!guesserBreakdown) {
          continue
        }

        if (guess.autoSubmitted) {
          guesserBreakdown.autoSubmissionPenalty += SCORE_AUTO_GUESS_PENALTY
          continue
        }

        if (!guess.isCorrect) {
          continue
        }

        guesserBreakdown.correctGuesses += 1
        guesserBreakdown.guessPoints += SCORE_CORRECT_GUESS_POINTS
        if (firstCorrectGuesserId === guess.playerId) {
          guesserBreakdown.guessPoints += SCORE_FIRST_CORRECT_BONUS
        }
      }
    }

    const nextScores: Record<string, number> = {}
    const nextBreakdown: Record<string, SketchAndGuessScoreBreakdown> = {}
    for (const player of this.state.players) {
      const breakdown = breakdownByPlayer.get(player.id)
      if (!breakdown) continue

      breakdown.finalScore = Math.max(0, breakdown.guessPoints + breakdown.drawerPoints - breakdown.autoSubmissionPenalty)
      nextScores[player.id] = breakdown.finalScore
      nextBreakdown[player.id] = breakdown
      player.score = breakdown.finalScore
    }

    const playerOrder = new Map(this.state.players.map((player, index) => [player.id, index]))
    const ranking = this.state.players
      .map((player) => player.id)
      .sort((leftId, rightId) => {
        const scoreDelta = (nextScores[rightId] || 0) - (nextScores[leftId] || 0)
        if (scoreDelta !== 0) return scoreDelta

        const correctGuessDelta =
          (nextBreakdown[rightId]?.correctGuesses || 0) - (nextBreakdown[leftId]?.correctGuesses || 0)
        if (correctGuessDelta !== 0) return correctGuessDelta

        const penaltyDelta =
          (nextBreakdown[leftId]?.autoSubmissionPenalty || 0) - (nextBreakdown[rightId]?.autoSubmissionPenalty || 0)
        if (penaltyDelta !== 0) return penaltyDelta

        return (playerOrder.get(leftId) || 0) - (playerOrder.get(rightId) || 0)
      })

    data.scores = nextScores
    data.scoreBreakdown = nextBreakdown
    data.ranking = ranking
    data.winnerId = ranking[0] || null
  }

  private getCurrentRound(data: SketchAndGuessGameData): SketchAndGuessRound | null {
    const round = data.rounds.find((entry) => entry.round === data.currentRound)
    return round || null
  }

  private resolveDrawerId(round: number, drawerOrder: string[]): string {
    if (drawerOrder.length === 0) return ''
    const index = (round - 1) % drawerOrder.length
    return drawerOrder[index] || ''
  }

  private createRound(round: number, drawerId: string): SketchAndGuessRound {
    return {
      round,
      drawerId,
      prompt: this.resolvePrompt(round, drawerId),
      drawingContent: null,
      drawingSubmittedAt: null,
      drawingAutoSubmitted: false,
      guesses: [],
      revealAt: null,
      isScored: false,
      scoredAt: null,
    }
  }

  private resolvePrompt(round: number, drawerId: string): string {
    const drawerIndex = this.state.players.findIndex((player) => player.id === drawerId)
    const stableDrawerIndex = drawerIndex === -1 ? 0 : drawerIndex
    const promptIndex = (round - 1 + stableDrawerIndex) % PROMPT_POOL.length
    return PROMPT_POOL[promptIndex] || PROMPT_POOL[0]
  }

  private resolveTotalRounds(): number {
    const rawRounds = (this.config.rules as { rounds?: unknown } | undefined)?.rounds
    if (typeof rawRounds === 'number' && Number.isFinite(rawRounds) && rawRounds > 0) {
      return Math.min(MAX_TOTAL_ROUNDS, Math.max(MIN_TOTAL_ROUNDS, Math.floor(rawRounds)))
    }
    return DEFAULT_TOTAL_ROUNDS
  }

  private getExpectedGuesserCount(data: SketchAndGuessGameData): number {
    return Math.max(0, this.state.players.length - 1)
  }

  private getStringField(data: Record<string, unknown>, key: string): string | null {
    const value = data[key]
    return typeof value === 'string' ? value : null
  }

  private normalizeAnswer(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  private buildTimeoutFallbackDrawing(prompt: string): string {
    return JSON.stringify({
      type: 'drawing',
      version: 1,
      autoSubmitted: true,
      reason: 'timeout',
      promptHint: prompt,
      width: 64,
      height: 64,
      strokes: [
        {
          color: '#9ca3af',
          width: 2,
          points: [
            { x: 8, y: 8 },
            { x: 56, y: 56 },
          ],
        },
      ],
    })
  }
}
