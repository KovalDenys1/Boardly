import { GameConfig, GameEngine, Move, Player } from '../game-engine'
import { resolveBoundedRuleNumber, getStringField, resolvePlayerByRoundIndex } from './shared-helpers'

import {
  SKETCH_GUESS_MIN_INTERVAL_MS,
  SKETCH_MAX_GUESSES_PER_ROUND,
  SKETCH_PHASE_SECONDS,
  sketchPhaseSeconds,
  type SketchAndGuessPersistedPhase,
  type SketchAndGuessPhase,
} from './sketch-and-guess-phases'
import {
  SKETCH_WORDS,
  findSketchWordByEnglish,
  matchSketchGuess,
  type SketchWord,
} from './sketch-and-guess-words'

export type { SketchAndGuessPhase, SketchWord }

export interface SketchAndGuessGuess {
  /** `r<round>-g<n>`; what `accept-guess` names. Backfilled on restore for pre-#1082 rows. */
  id: string
  playerId: string
  guess: string
  submittedAt: number
  isCorrect: boolean
  /** Pre-#1082 only: the guessing phase ran out and the server filled the seat in. */
  autoSubmitted?: boolean
  /** The host marked this wrong guess correct (#1082). */
  acceptedByHost?: boolean
}

export interface SketchAndGuessRound {
  round: number
  drawerId: string
  /**
   * The chosen word's English display form, '' until one is chosen. Kept because a
   * round persisted before #1082 stored only this; new code reads `word`.
   */
  prompt: string
  /** The chosen word, every language. Null during `choosing`. */
  word: SketchWord | null
  /** The three words offered to the drawer. Only the drawer sees them before the reveal. */
  wordChoices: SketchWord[]
  /** The choosing clock ran out and the server picked. */
  wordAutoPicked: boolean
  /** When drawing (and so guessing) began; the speed bonus is measured from here. */
  drawingStartedAt: number | null
  drawingContent: string | null
  drawingSubmittedAt: number | null
  /** No drawing arrived, or it was blank: the drawer pays the auto-submission penalty. */
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
  /** When the current phase began. The phase clock, since every guess moves `lastMoveAt`. */
  phaseStartedAt: number | null
  currentRound: number
  totalRounds: number
  drawerOrder: string[]
  currentDrawerId: string
  rounds: SketchAndGuessRound[]
  /** Who has guessed the current round correctly. Public: it says who, never what. */
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
  autoPickedWords: number
  autoSubmittedDrawings: number
  /** Always 0 since #1082 – nobody owes a guess any more. Kept for the event shape. */
  autoSubmittedGuesses: number
  autoSubmittedPlayerIds: string[]
}

/** What the author of the last accepted `submit-guess` is told, and nobody else. */
export interface SketchAndGuessGuessOutcome {
  guessId: string
  correct: boolean
  /** One letter off a form of the word: a private "close!" hint, not a correct answer. */
  close: boolean
}

export type SketchAndGuessGuessRejection = 'too-fast' | 'limit-reached'

const DEFAULT_TOTAL_ROUNDS = 3
const MIN_TOTAL_ROUNDS = 1
const MAX_TOTAL_ROUNDS = 10
const MIN_DRAWING_CONTENT_LENGTH = 3
const MAX_DRAWING_CONTENT_LENGTH = 120_000
const MIN_GUESS_LENGTH = 2
const MAX_GUESS_LENGTH = 80
const SKETCH_TIMEOUT_FALLBACK_MAX_ITERATIONS = 256
const WORD_CHOICE_COUNT = 3

/** Every correct guess is worth this much before the speed bonus. */
const SCORE_CORRECT_GUESS_BASE = 50
/** Up to this much more, by the share of the drawing clock still left. */
const SCORE_CORRECT_GUESS_SPEED_MAX = 50
/** A round persisted before #1082 has no drawing start to measure speed from; it scores as it did then. */
const SCORE_LEGACY_CORRECT_GUESS_POINTS = 100
const SCORE_FIRST_CORRECT_BONUS = 20
const SCORE_DRAWER_PER_CORRECT_GUESS = 40
const SCORE_AUTO_DRAWING_PENALTY = 20
const SCORE_AUTO_GUESS_PENALTY = 10

function moveTime(move: Move): number {
  const at = move.timestamp instanceof Date ? move.timestamp.getTime() : NaN
  return Number.isFinite(at) ? at : Date.now()
}

/** A drawing with no strokes in it, which scores like no drawing at all. */
function isBlankDrawing(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { strokes?: unknown }
    return Array.isArray(parsed?.strokes) && parsed.strokes.length === 0
  } catch {
    return false
  }
}

/** A pre-#1082 round's English prompt that is not in the bank any more. */
function legacyWord(prompt: string): SketchWord {
  return { id: `legacy:${prompt}`, en: [prompt], no: [], ru: [], uk: [] }
}

export class SketchAndGuessGame extends GameEngine {
  private lastGuessOutcome: SketchAndGuessGuessOutcome | null = null

  constructor(gameId: string, config: GameConfig = { maxPlayers: 10, minPlayers: 3 }) {
    super(gameId, 'sketch_and_guess', config)
  }

  getInitialGameData(): SketchAndGuessGameData {
    return {
      phase: 'choosing',
      phaseStartedAt: null,
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
    data.phase = 'choosing'
    data.phaseStartedAt = typeof this.state.lastMoveAt === 'number' ? this.state.lastMoveAt : Date.now()
    data.submittedPlayerIds = []
    data.rounds = [this.createRound(1, data.currentDrawerId, [])]
    data.scores = {}
    data.scoreBreakdown = {}
    data.winnerId = null
    data.ranking = []
    data.completionReason = null
    data.finishedAt = null
    this.recomputeScoreboard(data)
    return true
  }

  /**
   * A game persisted before #1082 is still being played somewhere when this
   * ships, and it has none of the new fields and possibly a `guessing` phase.
   * It is brought up to shape here, on every restore, so nothing downstream
   * has to know there was an older one:
   *
   * - every round gets its `word` from its English `prompt` (the old pool is the
   *   head of the bank, so all four languages start counting mid-game);
   * - every guess gets an id, so the host can accept it;
   * - `guessing` becomes `drawing` with the guesses it already had, its clock
   *   restarted from when guessing began. The drawing is already stored, so the
   *   round carries on as a drawing phase in which the drawer has stopped;
   * - `submittedPlayerIds` goes from "has answered" to "has answered correctly",
   *   so a player who guessed wrong in the old one-shot phase may try again.
   */
  protected normalizeRestoredData(): void {
    const data = this.state.data as (SketchAndGuessGameData & { phase: SketchAndGuessPersistedPhase }) | undefined
    if (!data || typeof data !== 'object' || !Array.isArray(data.rounds)) return

    const lastMoveAt =
      typeof this.state.lastMoveAt === 'number' && Number.isFinite(this.state.lastMoveAt) ? this.state.lastMoveAt : null

    for (const round of data.rounds) {
      const legacy = round as Partial<SketchAndGuessRound> & SketchAndGuessRound
      if (legacy.word === undefined) {
        legacy.word = legacy.prompt ? findSketchWordByEnglish(legacy.prompt) ?? legacyWord(legacy.prompt) : null
      }
      if (!Array.isArray(legacy.wordChoices)) legacy.wordChoices = []
      if (typeof legacy.wordAutoPicked !== 'boolean') legacy.wordAutoPicked = false
      if (legacy.drawingStartedAt === undefined) legacy.drawingStartedAt = null
      if (!Array.isArray(legacy.guesses)) legacy.guesses = []
      legacy.guesses.forEach((guess, index) => {
        if (typeof guess.id !== 'string' || !guess.id) guess.id = `r${legacy.round}-g${index + 1}`
      })
    }

    const wasGuessing = data.phase === 'guessing'
    if (wasGuessing) data.phase = 'drawing'
    if (data.phase !== 'choosing' && data.phase !== 'drawing' && data.phase !== 'reveal') data.phase = 'drawing'
    if (typeof data.phaseStartedAt !== 'number' || !Number.isFinite(data.phaseStartedAt)) {
      data.phaseStartedAt = lastMoveAt
    }

    const current = data.rounds.find((round) => round.round === data.currentRound)
    if (current && data.phase === 'drawing') {
      if (current.drawingStartedAt === null) current.drawingStartedAt = data.phaseStartedAt
      if (wasGuessing || !Array.isArray(data.submittedPlayerIds)) {
        data.submittedPlayerIds = [...new Set(current.guesses.filter((g) => g.isCorrect).map((g) => g.playerId))]
      }
    }
    if (!Array.isArray(data.submittedPlayerIds)) data.submittedPlayerIds = []
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

    const round = this.getCurrentRound(data)
    if (!round) {
      return false
    }

    switch (move.type) {
      case 'choose-word': {
        if (data.phase !== 'choosing' || move.playerId !== data.currentDrawerId) return false
        const wordId = getStringField(move.data, 'wordId')
        return !!wordId && round.wordChoices.some((choice) => choice.id === wordId)
      }

      case 'submit-guess': {
        if (data.phase !== 'drawing' || !round.word) return false
        if (move.playerId === data.currentDrawerId) return false
        if (data.submittedPlayerIds.includes(move.playerId)) return false
        const guess = getStringField(move.data, 'guess')
        if (!guess) return false
        const length = guess.trim().length
        if (length < MIN_GUESS_LENGTH || length > MAX_GUESS_LENGTH) return false
        return this.getGuessRejection(move) === null
      }

      // The drawing that is kept for the reveal. Since #1082 the drawer draws
      // until the clock or the last guesser ends the round, and their page sends
      // the canvas as the reveal begins; so this is accepted in the reveal too,
      // once, and never ends a phase.
      case 'submit-drawing': {
        if (move.playerId !== data.currentDrawerId) return false
        if (data.phase !== 'drawing' && data.phase !== 'reveal') return false
        if (round.isScored || round.drawingContent !== null) return false
        const content = getStringField(move.data, 'content')
        if (!content) return false
        const length = content.trim().length
        return length >= MIN_DRAWING_CONTENT_LENGTH && length <= MAX_DRAWING_CONTENT_LENGTH
      }

      case 'accept-guess': {
        // Who the host is lives on the lobby, not in game state: the route
        // checks `lobby.creatorId` and says so here. Everything else is ours.
        if (move.data?.authorizedAsHost !== true) return false
        if (data.phase !== 'drawing' && data.phase !== 'reveal') return false
        if (round.isScored) return false
        const guessId = getStringField(move.data, 'guessId')
        const guess = guessId ? round.guesses.find((entry) => entry.id === guessId) : undefined
        if (!guess) return false
        if (guess.playerId === move.playerId || guess.playerId === round.drawerId) return false
        // Accepting twice is the same as accepting once.
        if (guess.acceptedByHost) return true
        if (guess.isCorrect || guess.autoSubmitted) return false
        // One correct answer per player per round: once they have it, the rest
        // of what they typed is history, not another chance to score.
        return !round.guesses.some((entry) => entry.playerId === guess.playerId && entry.isCorrect)
      }

      case 'advance-round':
        // Not before the drawing is in: the drawer's page sends it as the reveal
        // opens, and moving on first would score the drawer for a blank canvas.
        // A drawer who never sends one is covered by the reveal timeout.
        return data.phase === 'reveal' && round.drawingContent !== null

      default:
        return false
    }
  }

  /**
   * Why a guess that is otherwise well formed is being turned away, so the route
   * can say "slow down" rather than "invalid move". Null when it may go in.
   */
  getGuessRejection(move: Move): SketchAndGuessGuessRejection | null {
    const round = this.getCurrentRound(this.state.data as SketchAndGuessGameData)
    if (!round) return null
    const own = round.guesses.filter((guess) => guess.playerId === move.playerId && !guess.autoSubmitted)
    if (own.length >= SKETCH_MAX_GUESSES_PER_ROUND) return 'limit-reached'
    const last = own.reduce((latest, guess) => Math.max(latest, guess.submittedAt), -Infinity)
    if (moveTime(move) - last < SKETCH_GUESS_MIN_INTERVAL_MS) return 'too-fast'
    return null
  }

  /** The private result of the last `submit-guess` this instance applied. */
  getLastGuessOutcome(): SketchAndGuessGuessOutcome | null {
    return this.lastGuessOutcome
  }

  /** Whether `accept-guess` for this guess would change nothing, so the route need not write. */
  isGuessAcceptedByHost(guessId: string): boolean {
    const round = this.getCurrentRound(this.state.data as SketchAndGuessGameData)
    return !!round?.guesses.some((guess) => guess.id === guessId && guess.acceptedByHost === true)
  }

  processMove(move: Move): void {
    const data = this.state.data as SketchAndGuessGameData
    const now = moveTime(move)
    const round = this.getCurrentRound(data)
    if (!round) return

    if (move.type === 'choose-word' && data.phase === 'choosing') {
      const wordId = getStringField(move.data, 'wordId')
      const word = round.wordChoices.find((choice) => choice.id === wordId)
      if (word) this.beginDrawing(data, round, word, now, false)
      return
    }

    if (move.type === 'submit-guess' && data.phase === 'drawing' && round.word) {
      const guess = getStringField(move.data, 'guess')
      if (!guess) return
      const text = guess.trim()
      const match = matchSketchGuess(text, round.word)
      const entry: SketchAndGuessGuess = {
        id: `r${round.round}-g${round.guesses.length + 1}`,
        playerId: move.playerId,
        guess: text,
        submittedAt: now,
        isCorrect: match === 'correct',
      }
      round.guesses.push(entry)
      this.lastGuessOutcome = { guessId: entry.id, correct: entry.isCorrect, close: match === 'close' }
      if (entry.isCorrect) this.recordCorrectGuesser(data, round, move.playerId, now)
      return
    }

    if (move.type === 'submit-drawing') {
      const content = getStringField(move.data, 'content')
      if (!content) return
      const trimmed = content.trim()
      round.drawingContent = trimmed
      round.drawingSubmittedAt = now
      round.drawingAutoSubmitted = isBlankDrawing(trimmed)
      this.recomputeScoreboard(data)
      return
    }

    if (move.type === 'accept-guess') {
      const guessId = getStringField(move.data, 'guessId')
      const guess = round.guesses.find((entry) => entry.id === guessId)
      if (!guess || guess.acceptedByHost) return
      // Scored exactly as a match at the moment it was typed: same submittedAt,
      // so the speed bonus and the first-correct bonus fall where they would have.
      guess.isCorrect = true
      guess.acceptedByHost = true
      this.recordCorrectGuesser(data, round, guess.playerId, now)
      return
    }

    if (move.type === 'advance-round' && data.phase === 'reveal') {
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
      'Each round the drawer picks one of three words and draws it.',
      'Everyone else guesses as often as they like while the drawing is made; any site language counts.',
      'A correct guess scores 50 points plus up to 50 for speed, and 20 more for the first one in.',
      'The drawer scores 40 points for every player who guesses the word; the host may accept a near miss.',
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
   *
   * Measured from `data.phaseStartedAt`, not `lastMoveAt`: every guess is a move,
   * and a clock that restarted on each one would never run out while anyone typed.
   */
  applyTimeoutFallback(_turnTimerSeconds?: number, nowMs: number = Date.now()): SketchAndGuessTimeoutResolution {
    const result: SketchAndGuessTimeoutResolution = {
      changed: false,
      timeoutWindowsConsumed: 0,
      phaseTransitions: 0,
      revealAdvances: 0,
      autoPickedWords: 0,
      autoSubmittedDrawings: 0,
      autoSubmittedGuesses: 0,
      autoSubmittedPlayerIds: [],
    }

    if (this.state.status !== 'playing') {
      return result
    }

    const initialData = this.state.data as SketchAndGuessGameData
    let phaseStartedAt =
      typeof initialData.phaseStartedAt === 'number' && Number.isFinite(initialData.phaseStartedAt)
        ? initialData.phaseStartedAt
        : typeof this.state.lastMoveAt === 'number' && Number.isFinite(this.state.lastMoveAt)
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
      const timeoutMs = Math.max(1, sketchPhaseSeconds(data.phase) * 1000)
      if (nowMs - phaseStartedAt < timeoutMs) break

      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const currentRound = this.getCurrentRound(data)
      if (!currentRound) {
        break
      }

      if (data.phase === 'choosing') {
        const choices = currentRound.wordChoices.length > 0 ? currentRound.wordChoices : this.pickWordChoices(data.rounds)
        const word = choices[Math.floor(Math.random() * choices.length)] || choices[0]
        if (!word) break
        this.beginDrawing(data, currentRound, word, timeoutAt, true)
        result.autoPickedWords += 1
      } else if (data.phase === 'drawing') {
        this.enterReveal(data, currentRound, timeoutAt)
      } else if (data.phase === 'reveal') {
        if (currentRound.drawingContent === null) {
          currentRound.drawingContent = this.buildTimeoutFallbackDrawing()
          currentRound.drawingAutoSubmitted = true
          currentRound.drawingSubmittedAt = timeoutAt
          result.autoSubmittedDrawings += 1
          if (!result.autoSubmittedPlayerIds.includes(currentRound.drawerId)) {
            result.autoSubmittedPlayerIds.push(currentRound.drawerId)
          }
        }
        this.advanceAfterReveal(data, timeoutAt)
        result.revealAdvances += 1
      } else {
        break
      }

      result.changed = true
      result.timeoutWindowsConsumed += 1
      phaseStartedAt = timeoutAt
    }

    // A reveal that moved the game on is counted as such; every other lap was a phase transition.
    result.phaseTransitions = result.timeoutWindowsConsumed - result.revealAdvances
    return result
  }

  private beginDrawing(
    data: SketchAndGuessGameData,
    round: SketchAndGuessRound,
    word: SketchWord,
    at: number,
    autoPicked: boolean
  ): void {
    round.word = word
    round.prompt = word.en[0] || ''
    round.wordAutoPicked = autoPicked
    round.drawingStartedAt = at
    data.phase = 'drawing'
    data.phaseStartedAt = at
    data.submittedPlayerIds = []
    this.state.lastMoveAt = at
  }

  private enterReveal(data: SketchAndGuessGameData, round: SketchAndGuessRound, at: number): void {
    data.phase = 'reveal'
    data.phaseStartedAt = at
    round.revealAt = round.revealAt || at
    this.state.lastMoveAt = at
  }

  /** A guesser has it – typed or accepted. Scores go up now, and the round ends if they were the last. */
  private recordCorrectGuesser(
    data: SketchAndGuessGameData,
    round: SketchAndGuessRound,
    playerId: string,
    at: number
  ): void {
    if (!data.submittedPlayerIds.includes(playerId)) data.submittedPlayerIds.push(playerId)
    this.recomputeScoreboard(data)

    if (data.phase !== 'drawing') return
    const guessers = this.state.players.filter((player) => player.id !== round.drawerId)
    const everyoneHasIt = guessers.length > 0 && guessers.every((player) => data.submittedPlayerIds.includes(player.id))
    if (everyoneHasIt) this.enterReveal(data, round, at)
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
    data.phase = 'choosing'
    data.phaseStartedAt = nowMs
    data.submittedPlayerIds = []
    data.rounds.push(this.createRound(data.currentRound, data.currentDrawerId, data.rounds))
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

  /**
   * Points for one correct guess, before the first-correct bonus. A round with
   * no recorded drawing start was persisted before #1082 and keeps its old flat
   * score, so a game that spans the deploy does not re-rank its finished rounds.
   */
  private correctGuessPoints(round: SketchAndGuessRound, guess: SketchAndGuessGuess): number {
    if (typeof round.drawingStartedAt !== 'number') return SCORE_LEGACY_CORRECT_GUESS_POINTS
    const drawingMs = SKETCH_PHASE_SECONDS.drawing * 1000
    const left = (round.drawingStartedAt + drawingMs - guess.submittedAt) / drawingMs
    const share = Math.min(1, Math.max(0, left))
    return SCORE_CORRECT_GUESS_BASE + Math.round(SCORE_CORRECT_GUESS_SPEED_MAX * share)
  }

  /**
   * Scores are live since #1082: the round being played counts as soon as
   * somebody guesses it, rather than one round late at the reveal.
   */
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
      if (!round.isScored && round.round !== data.currentRound) {
        continue
      }

      const correctGuesses = round.guesses
        .filter((guess) => guess.isCorrect)
        .sort((left, right) => left.submittedAt - right.submittedAt)
      const firstCorrectGuessId = correctGuesses[0]?.id ?? null

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
        guesserBreakdown.guessPoints += this.correctGuessPoints(round, guess)
        if (firstCorrectGuessId === guess.id) {
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

  private createRound(round: number, drawerId: string, previousRounds: SketchAndGuessRound[]): SketchAndGuessRound {
    return {
      round,
      drawerId,
      prompt: '',
      word: null,
      wordChoices: this.pickWordChoices(previousRounds),
      wordAutoPicked: false,
      drawingStartedAt: null,
      drawingContent: null,
      drawingSubmittedAt: null,
      drawingAutoSubmitted: false,
      guesses: [],
      revealAt: null,
      isScored: false,
      scoredAt: null,
    }
  }

  /**
   * Three distinct words no earlier round of this game was played with. The
   * bank is far larger than the ten-round ceiling, but if it ever ran short the
   * pick falls back to words already played rather than offering fewer.
   */
  private pickWordChoices(previousRounds: SketchAndGuessRound[]): SketchWord[] {
    const used = new Set(previousRounds.map((round) => round.word?.id).filter((id): id is string => !!id))
    const fresh = SKETCH_WORDS.filter((word) => !used.has(word.id))
    const pool = fresh.length >= WORD_CHOICE_COUNT ? fresh.slice() : SKETCH_WORDS.slice()
    const picked: SketchWord[] = []
    while (picked.length < WORD_CHOICE_COUNT && pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length)
      picked.push(pool.splice(index, 1)[0])
    }
    return picked.map((word) => ({ ...word, en: [...word.en], no: [...word.no], ru: [...word.ru], uk: [...word.uk] }))
  }

  private resolveTotalRounds(): number {
    return resolveBoundedRuleNumber(this.config.rules, 'rounds', {
      min: MIN_TOTAL_ROUNDS,
      max: MAX_TOTAL_ROUNDS,
      fallback: DEFAULT_TOTAL_ROUNDS,
    })
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
 * The secrets, for everybody but the drawer, until the reveal:
 *
 * - the word, in every language: `prompt` (its English form), `word` (all four),
 *   and `wordChoices` (the three it was picked from, which narrow it to one in
 *   three). The drawer keeps them – it is their move.
 * - the text of every correct guess, which *is* the word spelled out (#1032:
 *   played with three seats on 2026-09-20, the second guesser's own snapshot
 *   carried `[{"guess":"island","isCorrect":true}]` while they were still typing).
 *   Since #1082 the feed shows every guess to everyone, so a correct one stays in
 *   the list – "<name> guessed it!" is the point of the feed – with its text
 *   blanked for everyone but its author and the drawer.
 *
 * A wrong guess is not a secret and is left alone: the whole table watching the
 * misses is what the feed is for, and the host needs to read them to accept one.
 *
 * `viewerUserId === null` is the shared-broadcast and spectator case: no guess
 * has an owner to match, so every correct guess is blanked and no word is given.
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
  const viewerIsDrawer = viewerUserId !== null && viewerUserId === currentRound.drawerId

  const sanitizedRounds = data.rounds.slice()
  sanitizedRounds[currentRoundIndex] = {
    ...currentRound,
    prompt: viewerIsDrawer ? currentRound.prompt : '',
    word: viewerIsDrawer ? currentRound.word ?? null : null,
    wordChoices: viewerIsDrawer && Array.isArray(currentRound.wordChoices) ? currentRound.wordChoices : [],
    guesses: Array.isArray(currentRound.guesses)
      ? currentRound.guesses.map((guess) =>
          guess.isCorrect && !viewerIsDrawer && guess.playerId !== viewerUserId ? { ...guess, guess: '' } : guess
        )
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
 * Since #1082 `choose-word` carries `{ wordId }`, which is the word by another
 * name, and is dropped the same way.
 *
 * An allowlist rather than a denylist: a payload field reaches the whole lobby
 * only by being named here, so a new move type leaks nothing by default. The
 * counters below are the timeout-fallback bookkeeping, which says how many
 * submissions the server filled in and for whom – all of it already public in
 * the sanitized state.
 */
const BROADCAST_SAFE_ACTION_EVENT_FIELDS = new Set([
  'timeoutWindowsConsumed',
  'autoPickedWords',
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
