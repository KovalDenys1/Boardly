import { GameConfig, GameEngine, Move, Player } from '../game-engine'
import { resolveBoundedRuleNumber, getStringField, resolvePlayerByRoundIndex } from './shared-helpers'

import { SKETCH_PHASE_SECONDS, type SketchAndGuessPhase } from './sketch-and-guess-phases'

export type { SketchAndGuessPhase }

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

      const content = getStringField(move.data, 'content')
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

      const guess = getStringField(move.data, 'guess')
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
      const content = getStringField(move.data, 'content')
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
      const guess = getStringField(move.data, 'guess')
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
    return this.resolvePlayerWinner(data.winnerId)
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

  /**
   * `turnTimerSeconds` is accepted for the shared call shape the lobby route uses
   * and deliberately ignored — see `SKETCH_PHASE_SECONDS`. Before #1022 this game had no
   * clock a client could see at all, so a player who closed their tab stalled the
   * round for everyone until somebody reloaded.
   */
  applyTimeoutFallback(_turnTimerSeconds?: number, nowMs: number = Date.now()): SketchAndGuessTimeoutResolution {
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

    let phaseStartedAt =
      typeof this.state.lastMoveAt === 'number' && Number.isFinite(this.state.lastMoveAt)
        ? this.state.lastMoveAt
        : nowMs

    if (phaseStartedAt > nowMs) {
      phaseStartedAt = nowMs
    }

    let safetyCounter = 0
    while (this.state.status === 'playing' && safetyCounter < SKETCH_TIMEOUT_FALLBACK_MAX_ITERATIONS) {
      const data = this.state.data as SketchAndGuessGameData
      // Each phase has its own budget, so the deadline is recomputed every lap
      // rather than fixed before the loop (#1022).
      const timeoutMs = Math.max(1, SKETCH_PHASE_SECONDS[data.phase] * 1000)
      if (nowMs - phaseStartedAt < timeoutMs) break

      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const currentRound = this.getCurrentRound(data)
      if (!currentRound) {
        break
      }

      if (data.phase === 'drawing') {
        if (!currentRound.drawingContent) {
          currentRound.drawingContent = this.buildTimeoutFallbackDrawing()
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
    return resolvePlayerByRoundIndex(round, drawerOrder) || ''
  }

  private createRound(round: number, drawerId: string): SketchAndGuessRound {
    return {
      round,
      drawerId,
      prompt: this.resolvePrompt(),
      drawingContent: null,
      drawingSubmittedAt: null,
      drawingAutoSubmitted: false,
      guesses: [],
      revealAt: null,
      isScored: false,
      scoredAt: null,
    }
  }

  private resolvePrompt(): string {
    const randomIndex = Math.floor(Math.random() * PROMPT_POOL.length)
    return PROMPT_POOL[randomIndex] || PROMPT_POOL[0]
  }

  private resolveTotalRounds(): number {
    return resolveBoundedRuleNumber(this.config.rules, 'rounds', {
      min: MIN_TOTAL_ROUNDS,
      max: MAX_TOTAL_ROUNDS,
      fallback: DEFAULT_TOTAL_ROUNDS,
    })
  }

  private getExpectedGuesserCount(data: SketchAndGuessGameData): number {
    return Math.max(0, this.state.players.length - 1)
  }

  private normalizeAnswer(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  // #1032: this used to carry `promptHint: prompt`, which nothing ever read - the client
  // parses this JSON only for `type` and `strokes`. The sanitizer publishes
  // `rounds[].drawingContent` verbatim, so the field handed the secret word to every
  // guesser and to the shared lobby broadcast the moment the drawing phase timed out.
  private buildTimeoutFallbackDrawing(): string {
    return JSON.stringify({
      type: 'drawing',
      version: 1,
      autoSubmitted: true,
      reason: 'timeout',
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

/**
 * Strips the current round's secrets from state before it reaches a player who
 * must not have them – mirrors sanitizeSpyStateForBroadcast/sanitizeRpsStateForBroadcast.
 * Only the round matching data.currentRound can ever be unrevealed (advanceAfterReveal
 * only increments currentRound after that round's reveal+scoring), so every other
 * round in the array is always safe to return untouched.
 *
 * There are two secrets, not one. The prompt is the obvious one and was the
 * only one redacted until #1032. The other is the guesses themselves: a correct
 * guess *is* the prompt, spelled out, and `isCorrect` labels it as such. Played
 * with three seats on 2026-09-20, the second guesser's own snapshot came back
 * carrying `[{"guess":"island","isCorrect":true}]` while they were still typing
 * – the answer, handed to them, in every round. So a live round shows a viewer
 * only their own guess; the count everyone is allowed to see is
 * `data.submittedPlayerIds`, which says how many have answered and never what.
 *
 * `viewerUserId === null` is the shared-broadcast and spectator case: no guess
 * has an owner to match, so all of them drop, which is the redaction those
 * viewers should get anyway.
 */
export function sanitizeSketchAndGuessStateForBroadcast<T extends { data?: unknown; status?: string }>(
  state: T,
  viewerUserId: string | null = null
): T {
  const data = state.data as SketchAndGuessGameData | undefined
  if (!data || !Array.isArray(data.rounds)) return state

  const isCurrentRoundRevealed = data.phase === 'reveal' || state.status === 'finished'
  if (isCurrentRoundRevealed) return state

  const currentRoundIndex = data.rounds.findIndex((r) => r.round === data.currentRound)
  if (currentRoundIndex === -1) return state

  const currentRound = data.rounds[currentRoundIndex]
  // The drawer keeps the prompt – it is their move – but not the live guesses:
  // nobody reads another player's answer before the reveal.
  const viewerIsDrawer = viewerUserId !== null && viewerUserId === currentRound.drawerId

  const sanitizedRounds = data.rounds.slice()
  sanitizedRounds[currentRoundIndex] = {
    ...currentRound,
    prompt: viewerIsDrawer ? currentRound.prompt : '',
    guesses: Array.isArray(currentRound.guesses)
      ? currentRound.guesses.filter((guess) => guess.playerId === viewerUserId)
      : [],
  }

  return { ...state, data: { ...data, rounds: sanitizedRounds } }
}

/**
 * The same redaction for the other half of the broadcast.
 *
 * `broadcastToLobby('sketch-and-guess-action', …)` carries a `state` and a
 * `data`: the move's own payload, echoed so a client can react to what just
 * happened. Sanitizing `state` alone left the answer on the wire (#1032, second
 * pass): a submit-guess move's payload is `{ guess: '<the word>' }`, and the
 * lobby topic is the one channel every seated player is joined to
 * (lib/lobby-channel-registry.ts), so the first correct guess – which is the
 * prompt, spelled out – arrived at every other player the moment it was made.
 * Nothing in the app subscribes to this event, so no client lost anything when
 * the payload stopped carrying it; a player watching their own socket did.
 *
 * An allowlist rather than a denylist: a payload field reaches the whole lobby
 * only by being named here, so a new move type leaks nothing by default. The
 * counters below are the timeout-fallback bookkeeping, which says how many
 * submissions the server filled in and for whom – all of it already public in
 * the sanitized state.
 *
 * What the round genuinely needs to publish it publishes through `state`:
 * `submittedPlayerIds` for who has answered, `rounds[].drawingContent` for the
 * drawing, and the guesses themselves once the reveal makes them safe.
 */
const BROADCAST_SAFE_ACTION_EVENT_FIELDS = new Set([
  'timeoutWindowsConsumed',
  'autoSubmittedDrawings',
  'autoSubmittedGuesses',
  'autoSubmittedPlayerIds',
])

export function sanitizeSketchAndGuessActionEventForBroadcast(
  data: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!data) return {}

  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (BROADCAST_SAFE_ACTION_EVENT_FIELDS.has(key)) safe[key] = value
  }
  return safe
}

/**
 * Whether this player is the one seat that must not be talking right now.
 *
 * The drawer knows the word and is paid 40 points for every correct guess, so
 * the lobby chat is a channel they profit from leaking the answer down (#1034).
 * The page greys their composer out; this is the same rule where it binds –
 * POST /api/lobby/[code]/chat – because a greyed-out box stops the one player
 * with a motive to bypass it least of all.
 *
 * Only while the round is live: at the reveal the word is on everybody's screen
 * and the drawer talks again, and a finished game is all reveal.
 */
export function isSketchAndGuessDrawerMuted(params: {
  gameStatus: string
  state: unknown
  userId: string
}): boolean {
  const { gameStatus, state, userId } = params
  if (gameStatus !== 'playing') return false

  const data = (state as { data?: unknown } | null)?.data as SketchAndGuessGameData | undefined
  if (!data || typeof data !== 'object') return false
  if (data.phase === 'reveal') return false

  return typeof data.currentDrawerId === 'string' && data.currentDrawerId === userId
}
