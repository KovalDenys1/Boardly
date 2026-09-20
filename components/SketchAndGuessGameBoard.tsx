'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { SketchAndGuessGameData, SketchAndGuessRound } from '@/lib/games/sketch-and-guess-game'
import LoadingButton from '@/components/LoadingButton'

type TFn = (key: TranslationKeys, options?: string | Record<string, unknown>) => string

export interface SketchAndGuessPlayer {
  id: string
  name: string
}

type SketchAndGuessLifecycleStatus = 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled'

interface SketchAndGuessGameBoardProps {
  gameData: SketchAndGuessGameData
  gameStatus: SketchAndGuessLifecycleStatus
  playerId: string
  players: SketchAndGuessPlayer[]
  onSubmitDrawing: (content: string) => Promise<void>
  onSubmitGuess: (guess: string) => Promise<void>
  onAdvanceRound: () => Promise<void>
  isSubmitting: boolean
  isSpectator?: boolean
}

// ─── Drawing content format ────────────────────────────────────────────────
// { type: 'drawing', version: 1, width, height, strokes: [{ color, width, points: [{x,y}] }] }
// Kept intentionally simple (vector strokes, not raster) so it stays well
// under the engine's 120,000-char content limit even for a busy sketch.

interface StrokePoint {
  x: number
  y: number
}

interface Stroke {
  color: string
  width: number
  points: StrokePoint[]
}

interface DrawingContent {
  type: 'drawing'
  version: number
  width: number
  height: number
  strokes: Stroke[]
}

const CANVAS_SIZE = 480
const MAX_POINTS_TOTAL = 3000
const MIN_POINT_DISTANCE = 2.5
const MIN_POINT_DISTANCE_SQ = MIN_POINT_DISTANCE * MIN_POINT_DISTANCE

const BRUSH_COLORS = ['#1F1B16', '#E4572E', '#2E86AB', '#3FA34D', '#F2C14E']
const ERASER_COLOR = '#FFFFFF'
const BRUSH_WIDTH_THIN = 3
const BRUSH_WIDTH_THICK = 9

function parseDrawingContent(content: string | null): DrawingContent | null {
  if (!content) return null
  try {
    const parsed: unknown = JSON.parse(content)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).type === 'drawing' &&
      Array.isArray((parsed as Record<string, unknown>).strokes)
    ) {
      return parsed as DrawingContent
    }
  } catch {
    // Malformed content renders as a blank canvas rather than crashing the view.
  }
  return null
}

// ─── SketchCanvas primitive ────────────────────────────────────────────────
// Interactive mode: captures Pointer Events (unified mouse/touch/pen) into
// vector strokes. Read-only mode: just paints a fixed strokes array.
// Background is always solid white regardless of theme — this is a drawn
// object, not themed UI chrome (same principle as the game-board fixed-color
// rule for Connect Four/Tic-Tac-Toe).
//
// Sizing lives entirely in .sketch-canvas-wrap / .sketch-canvas-frame
// (app/globals.css): the wrapper is a size container, so the frame takes
// min(its width, its height) and the canvas is square at whatever the phase's
// controls left behind. It used to be an inline
// `calc(var(--game-h) - 220px)` here, which guessed at the chrome around it and
// was wrong for every phase but one.

function SketchCanvas({
  strokes,
  onStrokesChange,
  interactive,
  activeColor,
  activeWidth,
}: {
  strokes: Stroke[]
  onStrokesChange?: (strokes: Stroke[]) => void
  interactive: boolean
  activeColor?: string
  activeWidth?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const lastPointRef = useRef<StrokePoint | null>(null)
  const totalPointsRef = useRef(0)

  useEffect(() => {
    totalPointsRef.current = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0)
  }, [strokes])

  const redraw = useCallback(
    (liveStroke?: Stroke | null) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

      const allStrokes = liveStroke ? [...strokes, liveStroke] : strokes
      for (const stroke of allStrokes) {
        if (stroke.points.length === 0) continue

        if (stroke.points.length === 1) {
          ctx.fillStyle = stroke.color
          ctx.beginPath()
          ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }

        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
        }
        ctx.stroke()
      }
    },
    [strokes]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_SIZE * dpr
    canvas.height = CANVAS_SIZE * dpr
  }, [])

  useEffect(() => {
    redraw()
  }, [redraw])

  const getLogicalPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current
    const rect = canvas!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE
    return {
      x: Math.round(Math.min(CANVAS_SIZE, Math.max(0, x)) * 10) / 10,
      y: Math.round(Math.min(CANVAS_SIZE, Math.max(0, y)) * 10) / 10,
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive || !onStrokesChange || totalPointsRef.current >= MAX_POINTS_TOTAL) return
      e.currentTarget.setPointerCapture(e.pointerId)

      const point = getLogicalPoint(e)
      const stroke: Stroke = {
        color: activeColor || BRUSH_COLORS[0],
        width: activeWidth || BRUSH_WIDTH_THIN,
        points: [point],
      }
      currentStrokeRef.current = stroke
      lastPointRef.current = point
      drawingRef.current = true
      totalPointsRef.current += 1
      redraw(stroke)
    },
    [interactive, onStrokesChange, activeColor, activeWidth, getLogicalPoint, redraw]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || !currentStrokeRef.current || totalPointsRef.current >= MAX_POINTS_TOTAL) return

      const point = getLogicalPoint(e)
      const last = lastPointRef.current
      if (last) {
        const dx = point.x - last.x
        const dy = point.y - last.y
        if (dx * dx + dy * dy < MIN_POINT_DISTANCE_SQ) return
      }

      currentStrokeRef.current.points.push(point)
      lastPointRef.current = point
      totalPointsRef.current += 1
      redraw(currentStrokeRef.current)
    },
    [getLogicalPoint, redraw]
  )

  const finishStroke = useCallback(() => {
    if (!drawingRef.current || !currentStrokeRef.current || !onStrokesChange) {
      drawingRef.current = false
      currentStrokeRef.current = null
      return
    }

    drawingRef.current = false
    const finished = currentStrokeRef.current
    currentStrokeRef.current = null
    lastPointRef.current = null
    onStrokesChange([...strokes, finished])
  }, [onStrokesChange, strokes])

  return (
    <div className="sketch-canvas-wrap">
      <div className="sketch-canvas-frame">
        <canvas
          ref={canvasRef}
          style={{ cursor: interactive ? 'crosshair' : 'default', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
      </div>
    </div>
  )
}

// ─── Drawer view (phase: drawing, current drawer) ──────────────────────────

function DrawerCanvasView({
  prompt,
  onSubmit,
  isSubmitting,
  t,
}: {
  prompt: string
  onSubmit: (content: string) => Promise<void>
  isSubmitting: boolean
  t: TFn
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState(BRUSH_COLORS[0])
  const [isThick, setIsThick] = useState(false)
  const [isEraser, setIsEraser] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const activeWidth = isThick ? BRUSH_WIDTH_THICK : BRUSH_WIDTH_THIN
  const activeColor = isEraser ? ERASER_COLOR : color

  const handleSubmit = useCallback(async () => {
    if (strokes.length === 0) {
      setValidationError(t('games.guess_my_drawing.game.drawingTooEmpty'))
      return
    }
    setValidationError(null)
    const content: DrawingContent = { type: 'drawing', version: 1, width: CANVAS_SIZE, height: CANVAS_SIZE, strokes }
    await onSubmit(JSON.stringify(content))
  }, [strokes, onSubmit, t])

  return (
    <div className="sketch-phase">
      <div className="rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg2)] px-3 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-bd-ink-muted">
          {t('games.guess_my_drawing.game.yourPrompt')}
        </p>
        <p className="text-xl font-extrabold leading-tight text-bd-ink">{prompt}</p>
      </div>

      <SketchCanvas strokes={strokes} onStrokesChange={setStrokes} interactive activeColor={activeColor} activeWidth={activeWidth} />

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {BRUSH_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            onClick={() => {
              setColor(swatch)
              setIsEraser(false)
            }}
            className={`h-7 w-7 rounded-full border-2 transition ${
              !isEraser && color === swatch ? 'scale-110 border-bd-ink' : 'border-[var(--bd-line)]'
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <button
          type="button"
          onClick={() => setIsEraser((v) => !v)}
          className={`rounded-full border-2 px-2.5 py-1 text-xs font-semibold ${
            isEraser ? 'border-bd-ink bg-[var(--bd-bg2)]' : 'border-[var(--bd-line)]'
          }`}
        >
          <Icon name="eraser" size={13} /> {t('games.guess_my_drawing.game.eraser')}
        </button>
        <button
          type="button"
          onClick={() => setIsThick((v) => !v)}
          className="rounded-full border-2 border-[var(--bd-line)] px-2.5 py-1 text-xs font-semibold"
        >
          <span
            aria-hidden
            className="inline-block rounded-full bg-bd-ink align-middle"
            style={{ width: isThick ? 12 : 7, height: isThick ? 12 : 7 }}
          />{' '}
          {t('games.guess_my_drawing.game.brushSize')}
        </button>
        <button
          type="button"
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          disabled={strokes.length === 0}
          className="rounded-full border-2 border-[var(--bd-line)] px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          <Icon name="arrow-left" size={13} /> {t('games.guess_my_drawing.game.undo')}
        </button>
        <button
          type="button"
          onClick={() => setStrokes([])}
          disabled={strokes.length === 0}
          className="rounded-full border-2 border-[var(--bd-line)] px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          <Icon name="trash" size={13} /> {t('games.guess_my_drawing.game.clear')}
        </button>
      </div>

      {validationError && <p className="text-center text-sm font-semibold text-rose-600">{validationError}</p>}

      <LoadingButton
        onClick={handleSubmit}
        loading={isSubmitting}
        className="w-full bd-btn bd-btn-primary rounded-xl px-4 py-2.5 font-semibold"
      >
        {t('games.guess_my_drawing.game.submitDrawing')}
      </LoadingButton>
    </div>
  )
}

// ─── Waiting-for-the-drawer view (phase: drawing, everyone else) ───────────
// A blank square rather than a bare icon on a tall empty card: the drawing is
// about to appear exactly there, so the space is the frame for it, not a hole.

function AwaitingDrawingView({ drawerName, t }: { drawerName: string; t: TFn }) {
  return (
    <div className="sketch-phase">
      <SketchCanvas strokes={[]} interactive={false} />
      <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-bd-ink-muted">
        <Icon name="pencil" size={16} tone="muted" />
        {t('games.guess_my_drawing.game.waitingForDrawer', { name: drawerName })}
      </p>
    </div>
  )
}

// ─── Guesser view (phase: guessing) ────────────────────────────────────────

function GuesserCanvasView({
  round,
  canGuess,
  isDrawer,
  hasGuessed,
  onSubmitGuess,
  isSubmitting,
  submittedCount,
  totalGuessers,
  t,
}: {
  round: SketchAndGuessRound
  canGuess: boolean
  isDrawer: boolean
  hasGuessed: boolean
  onSubmitGuess: (guess: string) => Promise<void>
  isSubmitting: boolean
  submittedCount: number
  totalGuessers: number
  t: TFn
}) {
  const [guess, setGuess] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const parsedContent = useMemo(() => parseDrawingContent(round.drawingContent), [round.drawingContent])

  const handleSubmit = useCallback(async () => {
    // The box is only cleared after the round trip, so the guess is still on
    // screen while the request is out and pressing Enter again is the natural
    // thing to do (#1006).
    if (isSubmitting) return
    const trimmed = guess.trim()
    if (trimmed.length < 2) {
      setValidationError(t('games.guess_my_drawing.game.guessTooShort'))
      return
    }
    setValidationError(null)
    await onSubmitGuess(trimmed)
    setGuess('')
  }, [guess, isSubmitting, onSubmitGuess, t])

  return (
    <div className="sketch-phase">
      <SketchCanvas strokes={parsedContent?.strokes || []} interactive={false} />

      <p className="text-center text-xs font-semibold text-bd-ink-muted">
        {t('games.guess_my_drawing.game.guessersWaiting', { count: submittedCount, total: totalGuessers })}
      </p>

      {isDrawer ? (
        <p className="text-center text-sm text-bd-ink-muted">{t('games.guess_my_drawing.game.youAreDrawingWait')}</p>
      ) : !canGuess ? (
        <p className="text-center text-sm text-bd-ink-muted">{t('games.guess_my_drawing.game.spectatorNotice')}</p>
      ) : hasGuessed ? (
        <p className="text-center text-sm font-semibold text-emerald-600">
          {t('games.guess_my_drawing.game.alreadyGuessed')}
        </p>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
            disabled={isSubmitting}
            placeholder={t('games.guess_my_drawing.game.guessPlaceholder')}
            maxLength={80}
            className="w-full rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg)] px-4 py-2.5 text-center text-base font-semibold text-bd-ink"
          />
          {validationError && <p className="text-center text-sm font-semibold text-rose-600">{validationError}</p>}
          <LoadingButton
            onClick={handleSubmit}
            loading={isSubmitting}
            className="w-full bd-btn bd-btn-primary rounded-xl px-4 py-2.5 font-semibold"
          >
            {t('games.guess_my_drawing.game.submitGuess')}
          </LoadingButton>
        </div>
      )}
    </div>
  )
}

// ─── Reveal view (phase: reveal, and the finished board under the overlay) ──
// Deliberately does NOT recompute point totals client-side — the engine's
// scoring (first-correct bonus, drawer bonus, auto-submission penalties)
// stays server-authoritative. This view only shows correct/incorrect per
// guess; the scores panel reflects `data.scores` as of the last recompute
// (advanceAfterReveal), which is one round behind while the current round's
// reveal hasn't been advanced past yet.

function RevealView({
  round,
  players,
  currentUserId,
  canAdvance,
  isSpectator,
  onAdvanceRound,
  isSubmitting,
  isLastRound,
  t,
}: {
  round: SketchAndGuessRound
  players: SketchAndGuessPlayer[]
  currentUserId: string
  canAdvance: boolean
  isSpectator: boolean
  onAdvanceRound: () => Promise<void>
  isSubmitting: boolean
  isLastRound: boolean
  t: TFn
}) {
  const parsedContent = useMemo(() => parseDrawingContent(round.drawingContent), [round.drawingContent])
  const playerNameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])
  const sortedGuesses = useMemo(
    () => round.guesses.slice().sort((a, b) => a.submittedAt - b.submittedAt),
    [round.guesses]
  )
  const drawerName = playerNameById.get(round.drawerId) || t('games.guess_my_drawing.game.unknownPlayer')

  return (
    <div className="sketch-phase">
      <SketchCanvas strokes={parsedContent?.strokes || []} interactive={false} />

      <div className="rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg2)] px-3 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-bd-ink-muted">
          {t('games.guess_my_drawing.game.revealPrompt')}
        </p>
        <p className="text-xl font-extrabold leading-tight text-bd-ink">{round.prompt}</p>
        <p className="text-xs text-bd-ink-muted">
          {t('games.guess_my_drawing.game.drawnBy', { name: drawerName })}
          {round.drawingAutoSubmitted ? ` ${t('games.guess_my_drawing.game.autoSubmittedTag')}` : ''}
        </p>
      </div>

      <ul className="space-y-1.5">
        {sortedGuesses.length === 0 && (
          <li className="text-center text-sm text-bd-ink-muted">{t('games.guess_my_drawing.game.noGuesses')}</li>
        )}
        {sortedGuesses.map((g) => (
          <li
            key={g.playerId}
            className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${
              g.isCorrect
                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-[var(--bd-line)] bg-[var(--bd-bg)]'
            }`}
          >
            <span className="font-medium text-bd-ink">
              {playerNameById.get(g.playerId) || t('games.guess_my_drawing.game.unknownPlayer')}
              {g.playerId === currentUserId ? ` ${t('game.ui.you')}` : ''}
            </span>
            <span className={g.isCorrect ? 'font-semibold text-emerald-700' : 'text-bd-ink-muted'}>
              {g.autoSubmitted ? t('games.guess_my_drawing.game.autoSubmittedTag') : `"${g.guess}"`}{' '}
              <Icon name={g.isCorrect ? 'check' : 'close'} size={14} />
            </span>
          </li>
        ))}
      </ul>

      {canAdvance && (
        <LoadingButton
          onClick={onAdvanceRound}
          loading={isSubmitting}
          className="w-full bd-btn bd-btn-primary rounded-xl px-4 py-2.5 font-semibold"
        >
          {isLastRound ? t('games.guess_my_drawing.game.seeResults') : t('games.guess_my_drawing.game.nextRound')}
        </LoadingButton>
      )}
      {isSpectator && (
        <p className="text-center text-sm text-bd-ink-muted">{t('games.guess_my_drawing.game.spectatorNotice')}</p>
      )}
    </div>
  )
}

// ─── Scores panel rows ─────────────────────────────────────────────────────
// Every seat, which is why this is a list and not the two-card scoreboard
// header: the game seats up to ten. Ordered by the engine's own ranking once
// it exists, so the finished order matches the result overlay exactly.

export function SketchScoreRows({
  players,
  scores,
  ranking,
  currentUserId,
  drawerId,
  isFinished,
}: {
  players: SketchAndGuessPlayer[]
  scores: Record<string, number>
  ranking: string[]
  currentUserId: string
  drawerId?: string
  isFinished?: boolean
}) {
  const { t } = useTranslation()
  const ordered = useMemo(() => {
    if (isFinished && ranking.length > 0) {
      const byId = new Map(players.map((p) => [p.id, p]))
      const ranked = ranking.map((id) => byId.get(id)).filter((p): p is SketchAndGuessPlayer => !!p)
      const missing = players.filter((p) => !ranking.includes(p.id))
      return [...ranked, ...missing]
    }
    return players.slice().sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
  }, [players, scores, ranking, isFinished])

  return (
    <div className="sketch-panel__list">
      {ordered.map((p, index) => (
        <div key={p.id} className={`sketch-score-row${p.id === currentUserId ? ' sketch-score-row--me' : ''}`}>
          <span className="shrink-0 font-mono text-xs text-bd-ink-muted">{index + 1}</span>
          {p.id === drawerId && !isFinished && <Icon name="pencil" size={13} />}
          <span className="sketch-score-row__name">
            {p.name}
            {p.id === currentUserId ? ` ${t('game.ui.you')}` : ''}
          </span>
          <span className="sketch-score-row__score">{scores[p.id] || 0}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Top-level dispatcher ───────────────────────────────────────────────────
// Phases only. Round counter, scores and the result belong to the page's
// chrome now (#1034): GameScoreboardHeader, GameStatusBanner, the scores panel
// and GameResultOverlay.

export default function SketchAndGuessGameBoard({
  gameData,
  gameStatus,
  playerId,
  players,
  onSubmitDrawing,
  onSubmitGuess,
  onAdvanceRound,
  isSubmitting,
  isSpectator = false,
}: SketchAndGuessGameBoardProps) {
  const { t } = useTranslation()

  const currentRound = useMemo(
    () => gameData.rounds.find((r) => r.round === gameData.currentRound) || null,
    [gameData.rounds, gameData.currentRound]
  )
  const playerNameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const isFinished = gameStatus === 'finished'
  const isDrawer = !isSpectator && playerId === gameData.currentDrawerId
  const totalGuessers = Math.max(0, players.length - 1)
  const hasGuessed = !isSpectator && (currentRound?.guesses.some((g) => g.playerId === playerId) ?? false)
  const drawerName = playerNameById.get(gameData.currentDrawerId) || t('games.guess_my_drawing.game.unknownPlayer')

  if (!currentRound) {
    return <div className="sketch-phase items-center justify-center text-sm text-bd-ink-muted">{t('common.loading')}</div>
  }

  // A finished game keeps the last round on the board: the result overlay sits
  // over it and "View Board" dismisses the overlay to show exactly this.
  if (isFinished || gameData.phase === 'reveal') {
    return (
      <RevealView
        round={currentRound}
        players={players}
        currentUserId={playerId}
        canAdvance={!isSpectator && !isFinished}
        isSpectator={isSpectator}
        onAdvanceRound={onAdvanceRound}
        isSubmitting={isSubmitting}
        isLastRound={gameData.currentRound >= gameData.totalRounds}
        t={t}
      />
    )
  }

  if (gameData.phase === 'drawing') {
    return isDrawer ? (
      <DrawerCanvasView prompt={currentRound.prompt} onSubmit={onSubmitDrawing} isSubmitting={isSubmitting} t={t} />
    ) : (
      <AwaitingDrawingView drawerName={drawerName} t={t} />
    )
  }

  return (
    <GuesserCanvasView
      round={currentRound}
      canGuess={!isSpectator && !isDrawer}
      isDrawer={isDrawer}
      hasGuessed={hasGuessed}
      onSubmitGuess={onSubmitGuess}
      isSubmitting={isSubmitting}
      submittedCount={gameData.submittedPlayerIds.length}
      totalGuessers={totalGuessers}
      t={t}
    />
  )
}
