'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type {
  SketchAndGuessGameData,
  SketchAndGuessGuess,
  SketchAndGuessRound,
  SketchWordHint,
} from '@/lib/games/sketch-and-guess-game'
import { sketchWordDisplay, type SketchWord } from '@/lib/games/sketch-and-guess-word-display'
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
  onSubmitDrawing?: (content: string) => Promise<void>
  /** Resolves with the private result of the guess, when the server gave one. */
  onSubmitGuess: (guess: string) => Promise<SketchGuessResult | void>
  onAdvanceRound: () => Promise<void>
  /** Drawer, `choosing` phase: the word they picked from the three (#1082). */
  onChooseWord?: (wordId: string) => Promise<void>
  /** Host only: mark another player's wrong guess correct (#1082). */
  onAcceptGuess?: (guessId: string) => Promise<void>
  isSubmitting: boolean
  isSpectator?: boolean
  /** Whether the viewer created the lobby, which is who may accept a guess. */
  isHost?: boolean
  // #1034: the page lays the game out three times (desktop, phone landscape,
  // phone portrait) and mounts this board in each tree, so anything the player
  // has started and not submitted has to be owned above them – see `draft`.
  draft?: SketchAndGuessDraft
  onDraftChange?: (next: SketchAndGuessDraft) => void
  /** Drawer only: every change to the stroke in progress, to stream it live. */
  onLiveStroke?: (stroke: Stroke | null) => void
  /** Everyone else: the drawing as it is being drawn, for the current round. */
  liveView?: SketchLiveView | null
}

/** What the server tells the author of a guess and nobody else. */
export interface SketchGuessResult {
  correct: boolean
  close: boolean
}

// ─── Drawing content format ────────────────────────────────────────────────
// { type: 'drawing', version: 1, width, height, strokes: [{ color, width, points: [{x,y}] }] }
// Kept intentionally simple (vector strokes, not raster) so it stays well
// under the engine's 120,000-char content limit even for a busy sketch.

interface StrokePoint {
  x: number
  y: number
}

export interface Stroke {
  color: string
  width: number
  points: StrokePoint[]
}

/**
 * What the other players see while the drawer is still drawing: the finished
 * strokes plus the one under the drawer's finger. It travels over the lobby's
 * realtime channel, never through the server, and the drawing that counts is
 * still the one `submit-drawing` stores.
 */
export interface SketchLiveView {
  round: number
  strokes: Stroke[]
  live: Stroke | null
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

// ─── The unsubmitted half of a round ───────────────────────────────────────
// Everything the player has produced this round and not yet sent: the strokes
// on the canvas, the tool they are drawing with, the guess they are typing.
// It used to live in `useState` inside the two phase views, which was right
// while the page mounted one board; since the chrome migration (#1034) the page
// mounts three, one per layout tree, and only the tree matching the current
// media query is on screen. A rotation or a window drag across 1024px swaps
// trees, and a per-instance state means the new tree comes up empty – the
// drawer's work gone with the phase clock still running. So the page owns this
// and hands the same object to all three.

export interface SketchAndGuessDraft {
  strokes: Stroke[]
  color: string
  isThick: boolean
  isEraser: boolean
  guess: string
}

export function emptySketchAndGuessDraft(): SketchAndGuessDraft {
  return { strokes: [], color: BRUSH_COLORS[0], isThick: false, isEraser: false, guess: '' }
}

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
  onLiveStroke,
  liveStroke = null,
  interactive,
  activeColor,
  activeWidth,
  overlay,
}: {
  /** Laid over the canvas inside its frame – the word choices, or who is choosing. */
  overlay?: ReactNode
  strokes: Stroke[]
  onStrokesChange?: (strokes: Stroke[]) => void
  /** The stroke being drawn right now, on every point; null when it ends. */
  onLiveStroke?: (stroke: Stroke | null) => void
  /** Someone else's stroke in progress, painted on top in read-only mode. */
  liveStroke?: Stroke | null
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
    redraw(liveStroke)
  }, [redraw, liveStroke])

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
      onLiveStroke?.(stroke)
    },
    [interactive, onStrokesChange, onLiveStroke, activeColor, activeWidth, getLogicalPoint, redraw]
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
      onLiveStroke?.(currentStrokeRef.current)
    },
    [getLogicalPoint, redraw, onLiveStroke]
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
    onLiveStroke?.(null)
    onStrokesChange([...strokes, finished])
  }, [onStrokesChange, onLiveStroke, strokes])

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
        {overlay && <div className="sketch-canvas-overlay">{overlay}</div>}
      </div>
    </div>
  )
}

// ─── The word, as each viewer reads it ─────────────────────────────────────
// A round persisted before #1082 has only its English `prompt`; everything
// newer carries the whole word. Either way the viewer sees their own language.

function roundWord(round: SketchAndGuessRound): Pick<SketchWord, 'en' | 'no' | 'ru' | 'uk'> | null {
  if (round.word) return round.word
  return round.prompt ? { en: [round.prompt], no: [], ru: [], uk: [] } : null
}

// ─── Guess feed (phase: drawing and reveal, every viewer) ──────────────────
// Every guess of the round, the newest at the bottom and in view. A wrong
// one shows its text – the table watching the misses is half the fun, and the
// host has to read them to accept one. A correct one reads "<name> guessed it!";
// its text reaches only its author and the drawer until the reveal, and the
// server has already blanked it for everyone else.

function GuessFeed({
  guesses,
  nameOf,
  currentUserId,
  canAccept,
  onAcceptGuess,
  isSubmitting,
  t,
}: {
  guesses: SketchAndGuessGuess[]
  nameOf: (id: string) => string
  currentUserId: string
  canAccept: (guess: SketchAndGuessGuess) => boolean
  onAcceptGuess?: (guessId: string) => Promise<void>
  isSubmitting: boolean
  t: TFn
}) {
  // Newest first in the DOM, laid out bottom-up (`column-reverse`), so the list
  // rests on its newest line without a scroll effect – and stays there when the
  // viewport changes size, which a scrollTop set once on arrival does not.
  const ordered = useMemo(
    () => guesses.filter((g) => !g.autoSubmitted).slice().sort((a, b) => b.submittedAt - a.submittedAt),
    [guesses]
  )

  return (
    <section className="sketch-feed" aria-label={t('games.guess_my_drawing.game.guessesTitle')}>
      <ul className="sketch-feed__list">
        {ordered.length === 0 && <li className="sketch-feed__empty">{t('games.guess_my_drawing.game.guessFeedEmpty')}</li>}
        {ordered.map((g) => {
          const name = `${nameOf(g.playerId)}${g.playerId === currentUserId ? ` ${t('game.ui.you')}` : ''}`
          return (
            <li key={g.id || `${g.playerId}-${g.submittedAt}`} className={`sketch-feed__item${g.isCorrect ? ' sketch-feed__item--correct' : ''}`}>
              {g.isCorrect ? (
                <>
                  <Icon name="check" size={13} />
                  <span className="sketch-feed__text">
                    <strong>{t('games.guess_my_drawing.game.guessedIt', { name })}</strong>
                    {g.guess ? <span className="sketch-feed__guess"> “{g.guess}”</span> : null}
                    {g.acceptedByHost ? <span className="sketch-feed__tag"> {t('games.guess_my_drawing.game.acceptedByHost')}</span> : null}
                  </span>
                </>
              ) : g.nearMiss && !g.guess ? (
                // Nearly the word: the server kept its text back from this viewer.
                <span className="sketch-feed__text sketch-feed__text--close">{t('games.guess_my_drawing.game.isClose', { name })}</span>
              ) : (
                <>
                  <span className="sketch-feed__text">
                    <strong>{name}</strong>
                    <span className="sketch-feed__guess"> {g.guess}</span>
                    {g.nearMiss ? <span className="sketch-feed__tag"> {t('games.guess_my_drawing.game.closeGuess')}</span> : null}
                  </span>
                  {onAcceptGuess && canAccept(g) && (
                    <button
                      type="button"
                      className="sketch-feed__accept"
                      disabled={isSubmitting}
                      onClick={() => void onAcceptGuess(g.id)}
                    >
                      {t('games.guess_my_drawing.game.acceptGuess')}
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Choosing view (phase: choosing) ───────────────────────────────────────
// The blank canvas is already the frame the drawing will appear in, so the
// three words sit on it rather than on a card of their own.

function ChoosingView({
  round,
  isDrawer,
  drawerName,
  locale,
  onChooseWord,
  isSubmitting,
  t,
}: {
  round: SketchAndGuessRound
  isDrawer: boolean
  drawerName: string
  locale: string
  onChooseWord?: (wordId: string) => Promise<void>
  isSubmitting: boolean
  t: TFn
}) {
  const choices = isDrawer ? round.wordChoices ?? [] : []
  const overlay = isDrawer && choices.length > 0 ? (
    <div className="sketch-choices">
      <p className="sketch-choices__title">{t('games.guess_my_drawing.game.chooseWordTitle')}</p>
      {choices.map((word) => (
        <button
          key={word.id}
          type="button"
          className="sketch-choice-btn bd-btn bd-btn-primary"
          disabled={isSubmitting || !onChooseWord}
          onClick={() => void onChooseWord?.(word.id)}
        >
          {sketchWordDisplay(word, locale)}
        </button>
      ))}
    </div>
  ) : (
    <p className="sketch-choices__wait">
      <Icon name="pencil" size={16} tone="muted" /> {t('games.guess_my_drawing.game.choosingWait', { name: drawerName })}
    </p>
  )

  return (
    <div className="sketch-phase">
      <SketchCanvas strokes={[]} interactive={false} overlay={overlay} />
    </div>
  )
}

// ─── Drawer view (phase: drawing, current drawer) ──────────────────────────
// No submit button since #1082: the round ends when the clock does or when the
// last guesser has it, and the page sends the canvas as the reveal opens.

function DrawerCanvasView({
  word,
  draft,
  onDraftChange,
  onLiveStroke,
  feed,
  t,
}: {
  word: string
  draft: SketchAndGuessDraft
  onDraftChange: (patch: Partial<SketchAndGuessDraft>) => void
  onLiveStroke?: (stroke: Stroke | null) => void
  feed: ReactNode
  t: TFn
}) {
  const { strokes, color, isThick, isEraser } = draft
  const setStrokes = useCallback((next: Stroke[]) => onDraftChange({ strokes: next }), [onDraftChange])

  const activeWidth = isThick ? BRUSH_WIDTH_THICK : BRUSH_WIDTH_THIN
  const activeColor = isEraser ? ERASER_COLOR : color

  return (
    <div className="sketch-phase">
      <div className="sketch-word-chip">
        <span className="sketch-word-chip__label">{t('games.guess_my_drawing.game.yourPrompt')}</span>
        <span className="sketch-word-chip__word">{word}</span>
      </div>

      <SketchCanvas strokes={strokes} onStrokesChange={setStrokes} onLiveStroke={onLiveStroke} interactive activeColor={activeColor} activeWidth={activeWidth} />

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {BRUSH_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            onClick={() => onDraftChange({ color: swatch, isEraser: false })}
            className={`h-7 w-7 rounded-full border-2 transition ${
              !isEraser && color === swatch ? 'scale-110 border-bd-ink' : 'border-[var(--bd-line)]'
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <button
          type="button"
          onClick={() => onDraftChange({ isEraser: !isEraser })}
          className={`rounded-full border-2 px-2.5 py-1 text-xs font-semibold ${
            isEraser ? 'border-bd-ink bg-[var(--bd-bg2)]' : 'border-[var(--bd-line)]'
          }`}
        >
          <Icon name="eraser" size={13} /> {t('games.guess_my_drawing.game.eraser')}
        </button>
        <button
          type="button"
          onClick={() => onDraftChange({ isThick: !isThick })}
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
          onClick={() => setStrokes(strokes.slice(0, -1))}
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

      {feed}
    </div>
  )
}

// ─── Word hint (phase: drawing, everyone but the drawer) ───────────────────
// The word in the viewer's language as blanks, with the letters the server has
// uncovered so far. Only the server knows the word; this only draws the cells.

function WordHint({ hint, t }: { hint: SketchWordHint; t: TFn }) {
  const letters = hint.cells.filter((cell) => cell === null || /[\p{L}\p{N}]/u.test(cell)).length
  return (
    <div className="sketch-word-chip" aria-label={t('games.guess_my_drawing.game.hintLabel', { count: letters })}>
      <span className="sketch-word-hint" aria-hidden>
        {hint.cells.map((cell, index) => (
          <span key={index} className={cell === ' ' ? 'sketch-word-hint__gap' : 'sketch-word-hint__cell'}>
            {cell === null ? '_' : cell === ' ' ? '' : cell}
          </span>
        ))}
      </span>
      <span className="sketch-word-chip__label">{letters}</span>
    </div>
  )
}

// ─── Guesser view (phase: drawing, everyone else) ──────────────────────────
// The live canvas, the round's guesses, and the box to type the next one in.

function GuesserDrawingView({
  hint,
  liveView,
  canGuess,
  hasGuessedCorrectly,
  guess,
  onGuessChange,
  onSubmitGuess,
  isSubmitting,
  feed,
  t,
}: {
  hint: SketchWordHint | null
  liveView: SketchLiveView | null
  canGuess: boolean
  hasGuessedCorrectly: boolean
  guess: string
  onGuessChange: (next: string) => void
  onSubmitGuess: (guess: string) => Promise<SketchGuessResult | void>
  isSubmitting: boolean
  feed: ReactNode
  t: TFn
}) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [closeHint, setCloseHint] = useState(false)

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
    const result = await onSubmitGuess(trimmed)
    setCloseHint(!!result && result.close)
    onGuessChange('')
  }, [guess, isSubmitting, onGuessChange, onSubmitGuess, t])

  return (
    <div className="sketch-phase">
      {hint && <WordHint hint={hint} t={t} />}
      <SketchCanvas strokes={liveView?.strokes ?? []} liveStroke={liveView?.live ?? null} interactive={false} />

      {feed}

      {!canGuess ? (
        <p className="text-center text-sm text-bd-ink-muted">{t('games.guess_my_drawing.game.spectatorNotice')}</p>
      ) : hasGuessedCorrectly ? (
        <p className="text-center text-sm font-semibold text-emerald-600">{t('games.guess_my_drawing.game.alreadyGuessed')}</p>
      ) : (
        <div className="sketch-guess-form">
          <div className="sketch-guess-row">
            {/* readOnly rather than disabled while a guess is out: a disabled
                input drops focus, and on a phone that folds the keyboard away
                between every guess of a round that is all guesses (#1082). */}
            <input
              type="text"
              value={guess}
              onChange={(e) => {
                if (isSubmitting) return
                onGuessChange(e.target.value)
                if (closeHint) setCloseHint(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
              readOnly={isSubmitting}
              aria-busy={isSubmitting}
              placeholder={t('games.guess_my_drawing.game.guessPlaceholder')}
              maxLength={80}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-[var(--bd-line)] bg-[var(--bd-bg)] px-3 py-2 text-base font-semibold text-bd-ink"
            />
            {/* An arrow rather than a word: the row has to leave the box most of
                a 320px screen, and "Отправить ответ" alone would take half. */}
            <LoadingButton
              onClick={handleSubmit}
              loading={isSubmitting}
              className="bd-btn bd-btn-primary shrink-0 rounded-xl px-3 py-2"
            >
              <Icon name="arrow-right" size={20} label={t('games.guess_my_drawing.game.submitGuess')} />
            </LoadingButton>
          </div>
          {validationError ? (
            <p className="text-center text-xs font-semibold text-rose-600">{validationError}</p>
          ) : closeHint ? (
            <p className="text-center text-xs font-semibold text-amber-600">{t('games.guess_my_drawing.game.closeGuess')}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Reveal view (phase: reveal, and the finished board under the overlay) ──
// Deliberately does NOT recompute point totals client-side — the engine's
// scoring stays server-authoritative; the scores panel reads `data.scores`,
// which since #1082 already includes this round.

function RevealView({
  round,
  word,
  nameOf,
  liveView,
  canAdvance,
  isSpectator,
  onAdvanceRound,
  isSubmitting,
  isLastRound,
  feed,
  t,
}: {
  round: SketchAndGuessRound
  word: string
  nameOf: (id: string) => string
  liveView: SketchLiveView | null
  canAdvance: boolean
  isSpectator: boolean
  onAdvanceRound: () => Promise<void>
  isSubmitting: boolean
  isLastRound: boolean
  feed: ReactNode
  t: TFn
}) {
  const parsedContent = useMemo(() => parseDrawingContent(round.drawingContent), [round.drawingContent])
  // Until the drawer's page has sent the canvas, show what everyone watched being drawn.
  const strokes = parsedContent?.strokes ?? liveView?.strokes ?? []
  const drawingIn = round.drawingContent !== null && round.drawingContent !== undefined
  // Who got it is in the feed right under this, host-accepted ones marked, so
  // the banner only has to say so when nobody did.
  const nobodyGuessed = !round.guesses.some((g) => g.isCorrect)

  // The word and the button that moves on share one row above the canvas, so
  // "Next round" is on screen at 320x640 and 844x390 without scrolling the
  // board – below the feed it sat under the fold on both.
  return (
    <div className="sketch-phase">
      <div className="sketch-reveal-head">
        <div className="sketch-reveal-head__text">
          <p className="sketch-word-chip__label">{t('games.guess_my_drawing.game.revealPrompt')}</p>
          <p className="sketch-reveal-head__word">{word}</p>
          <p className="sketch-reveal-head__meta">
            {t('games.guess_my_drawing.game.drawnBy', { name: nameOf(round.drawerId) })}
            {round.drawingAutoSubmitted ? ` ${t('games.guess_my_drawing.game.autoSubmittedTag')}` : ''}
            {nobodyGuessed ? ` · ${t('games.guess_my_drawing.game.nobodyGuessed')}` : ''}
          </p>
          {isSpectator && <p className="sketch-reveal-head__meta">{t('games.guess_my_drawing.game.spectatorNotice')}</p>}
        </div>
        {canAdvance && (
          <LoadingButton
            onClick={onAdvanceRound}
            loading={isSubmitting}
            disabled={!drawingIn}
            className="bd-btn bd-btn-primary sketch-reveal-head__next rounded-xl px-3 py-2 text-sm font-semibold"
          >
            {!drawingIn
              ? t('games.guess_my_drawing.game.waitingForDrawing')
              : isLastRound
                ? t('games.guess_my_drawing.game.seeResults')
                : t('games.guess_my_drawing.game.nextRound')}
          </LoadingButton>
        )}
      </div>

      <SketchCanvas strokes={strokes} interactive={false} />

      {feed}
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
  onSubmitGuess,
  onAdvanceRound,
  onChooseWord,
  onAcceptGuess,
  isSubmitting,
  isSpectator = false,
  isHost = false,
  draft,
  onDraftChange,
  onLiveStroke,
  liveView = null,
}: SketchAndGuessGameBoardProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n?.language || 'en'

  // A board rendered on its own – a test, or any future single-tree page – keeps
  // its own draft. A page that mounts the board more than once must pass one in,
  // or each copy gets its own and the player loses whichever they were not
  // looking at (#1034).
  const [localDraft, setLocalDraft] = useState<SketchAndGuessDraft>(emptySketchAndGuessDraft)
  const activeDraft = draft ?? localDraft
  const patchDraft = useCallback(
    (patch: Partial<SketchAndGuessDraft>) => {
      const next = { ...activeDraft, ...patch }
      if (onDraftChange) onDraftChange(next)
      else setLocalDraft(next)
    },
    [activeDraft, onDraftChange]
  )
  const setGuess = useCallback((next: string) => patchDraft({ guess: next }), [patchDraft])

  const currentRound = useMemo(
    () => gameData.rounds.find((r) => r.round === gameData.currentRound) || null,
    [gameData.rounds, gameData.currentRound]
  )
  const playerNameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])
  const nameOf = useCallback(
    (id: string) => playerNameById.get(id) || t('games.guess_my_drawing.game.unknownPlayer'),
    [playerNameById, t]
  )

  const isFinished = gameStatus === 'finished'
  const isDrawer = !isSpectator && playerId === gameData.currentDrawerId
  const correctIds = useMemo(() => {
    const ids = new Set(gameData.submittedPlayerIds)
    for (const g of currentRound?.guesses ?? []) if (g.isCorrect) ids.add(g.playerId)
    return ids
  }, [gameData.submittedPlayerIds, currentRound])
  const hasGuessedCorrectly = !isSpectator && correctIds.has(playerId)
  const drawerName = nameOf(gameData.currentDrawerId)
  const liveForRound = liveView && liveView.round === gameData.currentRound ? liveView : null

  // The host may overrule the matcher on someone else's miss, while the round
  // is still open – drawing, or the reveal before it moves on (#1082). The
  // server enforces the same, this only decides where the button shows.
  const canAccept = useCallback(
    (g: SketchAndGuessGuess) =>
      isHost &&
      !isSpectator &&
      !isFinished &&
      (gameData.phase === 'drawing' || gameData.phase === 'reveal') &&
      !g.isCorrect &&
      !g.autoSubmitted &&
      !!g.id &&
      g.playerId !== playerId &&
      g.playerId !== currentRound?.drawerId &&
      !correctIds.has(g.playerId),
    [isHost, isSpectator, isFinished, gameData.phase, playerId, currentRound?.drawerId, correctIds]
  )

  if (!currentRound) {
    return <div className="sketch-phase items-center justify-center text-sm text-bd-ink-muted">{t('common.loading')}</div>
  }

  const feed = (
    <GuessFeed
      guesses={currentRound.guesses ?? []}
      nameOf={nameOf}
      currentUserId={playerId}
      canAccept={canAccept}
      onAcceptGuess={onAcceptGuess}
      isSubmitting={isSubmitting}
      t={t}
    />
  )

  // A finished game keeps the last round on the board: the result overlay sits
  // over it and "View Board" dismisses the overlay to show exactly this.
  if (isFinished || gameData.phase === 'reveal') {
    return (
      <RevealView
        round={currentRound}
        word={sketchWordDisplay(roundWord(currentRound), locale)}
        nameOf={nameOf}
        liveView={liveForRound}
        canAdvance={!isSpectator && !isFinished}
        isSpectator={isSpectator}
        onAdvanceRound={onAdvanceRound}
        isSubmitting={isSubmitting}
        isLastRound={gameData.currentRound >= gameData.totalRounds}
        feed={feed}
        t={t}
      />
    )
  }

  if (gameData.phase === 'choosing') {
    return (
      <ChoosingView
        round={currentRound}
        isDrawer={isDrawer}
        drawerName={drawerName}
        locale={locale}
        onChooseWord={onChooseWord}
        isSubmitting={isSubmitting}
        t={t}
      />
    )
  }

  return isDrawer ? (
    <DrawerCanvasView
      word={sketchWordDisplay(roundWord(currentRound), locale)}
      draft={activeDraft}
      onDraftChange={patchDraft}
      onLiveStroke={onLiveStroke}
      feed={feed}
      t={t}
    />
  ) : (
    <GuesserDrawingView
      hint={currentRound.wordHint ?? null}
      liveView={liveForRound}
      canGuess={!isSpectator}
      hasGuessedCorrectly={hasGuessedCorrectly}
      guess={activeDraft.guess}
      onGuessChange={setGuess}
      onSubmitGuess={onSubmitGuess}
      isSubmitting={isSubmitting}
      feed={feed}
      t={t}
    />
  )
}

/** The canvas as it stands, in the shape `submit-drawing` stores – the page sends it as the reveal opens. */
export function serializeSketchDrawing(strokes: Stroke[]): string {
  const content: DrawingContent = { type: 'drawing', version: 1, width: CANVAS_SIZE, height: CANVAS_SIZE, strokes }
  return JSON.stringify(content)
}
