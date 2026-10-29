'use client'

import React, { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import LeaveIcon from '@/components/LeaveIcon'
import type { IconName } from '@/components/icons/names'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'
import PushOptInNudge from '@/components/PushOptInNudge'
import { RESULT_MENU_ROW_CLASS } from '@/components/game-chrome/result-styles'
import type { AnalyticsGameType } from '@/lib/analytics'
import { prefersReducedMotion } from '@/lib/motion'
import { useRematchSignal } from '@/hooks/useRematchSignal'
import { playCue } from '@/lib/sound-engine'
import { resultCue } from '@/lib/game-outcome'
import { liveFinishWithin, RESULT_REVEAL_DELAY_MS } from '@/lib/live-finish'
import { noteFinishedGame } from '@/lib/finished-game'
import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'

/**
 * The end screen of every game (#736, #1578, #1564): a modal dialog over the
 * whole game screen with who won, the score, Play again and at most two more
 * actions; everything else waits behind More.
 *
 * It is portaled into the lobby's portal root, so a premium lobby theme still
 * colours it, and sits above every floating layer of a game page. It is modal
 * by aria-modal, a focus trap and a scrim that takes every pointer (#1549's
 * rule: focus moves in and stays, Escape closes it to View board, one scrim);
 * it never writes onto the page behind it, which React may still be hydrating.
 *
 * Motion (#1111): adopters mount it in the same render that applies the
 * finishing move, so it waits `revealDelayMs` (invisible, click-through, not
 * modal) for that move to land, then plays a staged entrance under 600 ms.
 * No wait under prefers-reduced-motion, and none when the player comes back
 * from View board to the same finish (`resultKey`).
 */
export interface ResultStanding {
  id: string
  name: string
  /** The player's result; leave it out where the game keeps no score. */
  score?: number | string
  isViewer?: boolean
}

export interface ResultExtraAction {
  key: string
  label: string
  icon?: IconName
  onClick: () => void
  disabled?: boolean
}

export interface GameResultOverlayProps {
  /** Already-translated personalized title ("Alice wins!", "You win!", "It's a draw"). */
  title: string
  /** A short line under the title: why the game ended, or that a series is over. */
  kicker?: string
  /** The emblem's glyph, bare (e.g. TTT's winning mark); the overlay draws the tile around it. */
  icon?: React.ReactNode
  isDraw?: boolean
  /** Accent for Play again and for the emblem when the viewer neither won nor lost. */
  accentColor?: string
  /** Deep accent for Play again's hard shadow. */
  accentShadowColor?: string
  /**
   * In seat order. A solo game reads as its one score, two players as a score
   * line ("3 – 1") in that order, as the scoreboard shows them, and three or
   * more as rows ranked by score.
   * Without any score nothing is shown.
   */
  standings?: ResultStanding[]
  onInspect: () => void
  /** The host gets Play again; everyone else the rematch ask or the waiting plate. */
  isHost: boolean
  /** Disables Play again / Return to lobby while a restart is in flight. */
  isLoading?: boolean
  onPlayAgain?: () => void
  onReturnToLobby?: () => void
  onLeave?: () => void
  /** Game-specific entries for More. */
  extraActions?: ResultExtraAction[]
  /** Replaces Play again / the rematch ask; a string is drawn as the status plate. */
  actionsReplacement?: React.ReactNode
  isGuest?: boolean
  /** Lobby code for "Play again with friends" (#927) and the rematch ask; omit it and neither is offered. */
  inviteCode?: string
  /** Tags the after-game Discord click, so the channel can be read per game (#982). */
  gameType: AnalyticsGameType
  /** `status === 'authenticated' && !isGuest`, decided by the caller — gates the push ask (#982). */
  isRegistered?: boolean
  /** How long after mount the overlay stays invisible so the finishing move can play (#1111). 0 shows it at once. */
  revealDelayMs?: number
  /**
   * Identifies this finish, e.g. `${game.id}:${state.lastMoveAt}` (#1111). Coming
   * back from View board skips the reveal wait only for the same key.
   */
  resultKey?: string
  /** The finished game, for the after-game "Watch replay" link. */
  gameId?: string | null
  /** A spectator watches; only a seated player may ask for a rematch. */
  isSpectator?: boolean
  /** False where the end screen already has its own rematch ask (Guess the Spy's results). */
  canAskRematch?: boolean
  /** The viewer's `viewerOutcome`; undefined plays `result.over`. */
  outcome?: GameOutcome
  /** False where the page already plays the result cue itself (Yahtzee). */
  playsResultCue?: boolean
}

export { RESULT_REVEAL_DELAY_MS }

/**
 * "View board" unmounts the overlay in every adopter, and coming back mounts it
 * again. The overlay notes which finish was being inspected: a later mount with
 * the same `resultKey` is a return, not a fresh finish, and must not wait again.
 */
let inspectedResultKey: string | null = null

// Tried, not heard: a cue the engine dropped must not sound late on the way back from View board.
const soundedResultKeys = new Set<string>()

/** How long after a finish the banner saw the overlay may still announce it, on top of its reveal delay. */
const LIVE_FINISH_WINDOW_MS = 3000

/** Rows that fit a 320×568 phone next to the title and the actions. */
const MAX_RANKED_ROWS = 5

function isReturnFromInspect(resultKey: string | undefined): boolean {
  return !!resultKey && inspectedResultKey === resultKey
}

/** Test seam: forget any pending "View board" note. */
export function resetResultOverlayRevealState(): void {
  inspectedResultKey = null
  soundedResultKeys.clear()
}

/*
 * Liar's Party renders three layout trees at once and lets CSS pick one, and
 * Memory has a mobile and a desktop tree, so a page can mount several overlays
 * for one finish. Once portaled they would all show; the first one mounted draws.
 */
const owners: number[] = []
let nextOwnerId = 1
const ownerListeners = new Set<() => void>()

function subscribeOwners(listener: () => void) {
  ownerListeners.add(listener)
  return () => {
    ownerListeners.delete(listener)
  }
}

function useIsDrawingInstance(): boolean {
  const [id] = useState(() => nextOwnerId++)
  useEffect(() => {
    owners.push(id)
    ownerListeners.forEach((listener) => listener())
    return () => {
      const at = owners.indexOf(id)
      if (at >= 0) owners.splice(at, 1)
      ownerListeners.forEach((listener) => listener())
    }
  }, [id])
  return useSyncExternalStore(subscribeOwners, () => owners[0] === id, () => false)
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[inert]'))
}

function cssToken(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

/** Scrim, card, result, actions: transform and opacity only, all settled inside 600 ms. */
function playEntrance(root: HTMLElement, reduced: boolean): Animation[] {
  const animations: Animation[] = []
  const run = (part: string, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const el = root.querySelector<HTMLElement>(`[data-entrance="${part}"]`)
    if (!el || typeof el.animate !== 'function') return
    animations.push(el.animate(keyframes, { fill: 'backwards', ...options }))
  }
  const fade = [{ opacity: 0 }, { opacity: 1 }]
  if (reduced) {
    run('scrim', fade, { duration: 200, easing: 'linear' })
    run('card', fade, { duration: 200, easing: 'linear' })
    return animations
  }
  const easeOut = cssToken('--bd-ease-out', 'cubic-bezier(0.2, 0.7, 0.2, 1)')
  const spring = cssToken('--bd-ease-spring', 'cubic-bezier(0.2, 1.4, 0.4, 1)')
  run('scrim', fade, { duration: 220, easing: easeOut })
  run('card', [
    { opacity: 0, transform: 'translateY(24px) scale(0.94)' },
    { opacity: 1, transform: 'none' },
  ], { delay: 40, duration: 380, easing: spring })
  run('result', [
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 1, transform: 'none' },
  ], { delay: 100, duration: 300, easing: easeOut })
  run('emblem', [{ transform: 'scale(0.4)' }, { transform: 'none' }], { delay: 120, duration: 380, easing: spring })
  run('celebration', [
    { opacity: 0, transform: 'scale(0.5) rotate(-24deg)' },
    { opacity: 1, transform: 'none' },
  ], { delay: 220, duration: 320, easing: easeOut })
  run('actions', [
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 1, transform: 'none' },
  ], { delay: 200, duration: 300, easing: easeOut })
  return animations
}

type VisualOutcome = 'win' | 'loss' | 'draw' | 'over'

const RAY_COLORS = ['var(--bd-coral)', 'var(--bd-sun)', 'var(--bd-mint)', 'var(--bd-lav)', 'var(--bd-sky)']
const RAYS = Array.from({ length: 10 }, (_, i) => ({ angle: i * 36 + 18, color: RAY_COLORS[i % RAY_COLORS.length], long: i % 2 === 0 }))

function Celebration() {
  return (
    <div
      data-testid="game-result-celebration"
      data-entrance="celebration"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      {RAYS.map((ray) => (
        <span
          key={ray.angle}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 6,
            height: ray.long ? 14 : 9,
            marginLeft: -3,
            marginTop: ray.long ? -7 : -4.5,
            background: ray.color,
            transform: `rotate(${ray.angle}deg) translateY(${ray.long ? -50 : -46}px)`,
          }}
        />
      ))}
    </div>
  )
}

const EMBLEM_TILE: Record<VisualOutcome, { background?: string; color: string }> = {
  win: { background: 'var(--bd-sun)', color: 'var(--bd-ink-on-accent)' },
  draw: { background: 'var(--bd-lav)', color: 'var(--bd-ink-on-accent)' },
  loss: { background: 'var(--bd-bg2)', color: 'var(--bd-ink-muted)' },
  over: { color: 'var(--bd-ink-on-accent)' },
}

function rankOf(rows: ResultStanding[]): number[] {
  const ranks: number[] = []
  rows.forEach((row, i) => {
    ranks.push(i > 0 && row.score !== undefined && row.score === rows[i - 1].score ? ranks[i - 1] : i + 1)
  })
  return ranks
}

const SECONDARY_BUTTON_CLASS =
  'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-bd-md border-[1.5px] border-bd-line bg-bd-bg px-3 py-1.5 text-center text-sm font-semibold leading-tight text-balance text-bd-ink transition-[transform,background-color] duration-150 ease-out hover:bg-bd-bg2 enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep'

const PRIMARY_BUTTON_CLASS =
  'inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-bd-md border-0 px-5 font-display text-lg font-bold text-bd-ink-on-accent transition-transform duration-150 ease-out enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep short-portrait:h-12'

const PLATE_CLASS =
  'grid min-h-[3.25rem] place-items-center rounded-bd-md bg-bd-bg2 px-4 py-2 text-center text-sm font-semibold text-bd-ink-muted short-portrait:min-h-12'

export default function GameResultOverlay({
  title,
  kicker,
  icon,
  isDraw = false,
  accentColor = 'var(--bd-mint)',
  accentShadowColor = 'var(--bd-mint-deep)',
  standings,
  onInspect,
  isHost,
  isLoading = false,
  onPlayAgain,
  onReturnToLobby,
  onLeave,
  extraActions,
  actionsReplacement,
  isGuest = false,
  inviteCode,
  gameType,
  isRegistered = false,
  gameId,
  isSpectator = false,
  canAskRematch = true,
  revealDelayMs = RESULT_REVEAL_DELAY_MS,
  resultKey,
  outcome,
  playsResultCue = true,
}: GameResultOverlayProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const standingsId = useId()
  const canAsk = canAskRematch && !isSpectator && (isGuest || isRegistered) && !!inviteCode
  const rematch = useRematchSignal(canAsk ? inviteCode : null, gameId ?? resultKey ?? null)
  const isDrawing = useIsDrawingInstance()
  // Decided once, at mount: a later prop change must not hide a visible overlay.
  const [revealed, setRevealed] = useState(
    () => revealDelayMs <= 0 || prefersReducedMotion() || isReturnFromInspect(resultKey)
  )
  const shown = revealed && isDrawing
  const [view, setView] = useState<'main' | 'more'>('main')
  const [lockedHeight, setLockedHeight] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreViewRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<'more-view' | 'more-button' | null>(null)
  const onInspectRef = useRef(onInspect)
  onInspectRef.current = onInspect

  useEffect(() => {
    // A mount for any other finish makes the note stale for good.
    if (inspectedResultKey !== resultKey) inspectedResultKey = null
    if (revealed) return
    const timer = setTimeout(() => setRevealed(true), revealDelayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, [])

  useEffect(() => {
    if (revealed && !isSpectator) noteFinishedGame()
  }, [revealed, isSpectator])

  // Not resultKey: its lastMoveAt changes when the server answers the winning move.
  const finishGameId = gameId ?? resultKey?.split(':')[0] ?? ''
  useEffect(() => {
    if (!revealed || !playsResultCue) return
    // A macrotask, so the banner's effect from the same commit has noted the finish.
    const timer = setTimeout(() => {
      const finish = liveFinishWithin(revealDelayMs + LIVE_FINISH_WINDOW_MS)
      if (finish === null) return
      // The finish's sequence tells a tic-tac-toe series' rounds apart: they share one game id.
      const soundKey = `${finishGameId}#${finish}`
      if (soundedResultKeys.has(soundKey)) return
      soundedResultKeys.add(soundKey)
      playCue(resultCue(outcome, isSpectator), { gameId: soundKey })
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the overlay is first seen
  }, [revealed])

  const rematchWantedBy = isHost ? rematch.requestedBy : null
  const heardRematchRef = useRef(rematchWantedBy)
  useEffect(() => {
    if (rematchWantedBy && rematchWantedBy !== heardRematchRef.current) playCue('social.ask')
    heardRematchRef.current = rematchWantedBy
  }, [rematchWantedBy])

  const handleInspect = () => {
    inspectedResultKey = resultKey ?? null
    onInspectRef.current()
  }
  const handleInspectRef = useRef(handleInspect)
  handleInspectRef.current = handleInspect

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!shown || !root) return
    const animations = playEntrance(root, prefersReducedMotion())
    return () => animations.forEach((animation) => animation.cancel())
  }, [shown])

  useEffect(() => {
    const root = rootRef.current
    const panel = panelRef.current
    if (!shown || !root || !panel) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Node | null
      const inside = !!target && root.contains(target)
      // Another dialog opened over this one (Leave's confirm) handles its own keys.
      if (!inside && target !== document.body && target !== document.documentElement) return
      if (event.key === 'Escape') {
        event.preventDefault()
        handleInspectRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusableIn(panel)
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel || !inside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [shown])

  useEffect(() => {
    const target = pendingFocusRef.current
    pendingFocusRef.current = null
    if (target === 'more-view' && moreViewRef.current) focusableIn(moreViewRef.current)[0]?.focus()
    if (target === 'more-button') moreButtonRef.current?.focus()
  }, [view])

  const openMore = () => {
    setLockedHeight(panelRef.current?.offsetHeight ?? null)
    pendingFocusRef.current = 'more-view'
    setView('more')
  }
  const closeMore = () => {
    pendingFocusRef.current = 'more-button'
    setView('main')
  }

  if (!isDrawing || typeof document === 'undefined') return null

  const visual: VisualOutcome = isDraw || outcome === 'draw' ? 'draw' : outcome === 'win' ? 'win' : outcome === 'loss' ? 'loss' : 'over'
  const celebrate = visual === 'win' && !isSpectator
  const tile = EMBLEM_TILE[visual]
  const glyph = icon ?? (
    <Icon name={visual === 'draw' ? 'handshake' : visual === 'loss' ? 'flag' : 'trophy'} size={34} />
  )

  const scored = (standings ?? []).filter((row) => row.score !== undefined)
  const solo = standings && standings.length === 1 && scored.length === 1 ? standings[0] : null
  const versus = standings && standings.length === 2 && scored.length === 2 ? standings : null
  const ranked = standings && standings.length >= 3 && scored.length > 0
    ? [...standings].sort((a, b) => (typeof b.score === 'number' ? b.score : -Infinity) - (typeof a.score === 'number' ? a.score : -Infinity))
    : null
  const ranks = ranked ? rankOf(ranked) : []
  let rankedRows = ranked ? ranked.map((row, i) => ({ row, rank: ranks[i], gap: false })) : []
  if (rankedRows.length > MAX_RANKED_ROWS) {
    const viewerAt = rankedRows.findIndex((entry) => entry.row.isViewer)
    rankedRows = viewerAt >= MAX_RANKED_ROWS - 1
      ? [...rankedRows.slice(0, MAX_RANKED_ROWS - 1), { ...rankedRows[viewerAt], gap: viewerAt > MAX_RANKED_ROWS - 1 }]
      : rankedRows.slice(0, MAX_RANKED_ROWS)
  }
  const hasStandings = !!solo || !!versus || !!ranked

  const showReturn = !actionsReplacement && isHost && !!onReturnToLobby

  const primary = actionsReplacement !== undefined && actionsReplacement !== null ? (
    typeof actionsReplacement === 'string' ? (
      <div className={PLATE_CLASS} role="status">{actionsReplacement}</div>
    ) : actionsReplacement
  ) : isHost ? (
    onPlayAgain ? (
      <button
        type="button"
        onClick={() => {
          playCue('ui.confirm')
          onPlayAgain()
        }}
        disabled={isLoading}
        aria-busy={isLoading || undefined}
        className={PRIMARY_BUTTON_CLASS}
        style={{ background: accentColor, boxShadow: `0 4px 0 ${accentShadowColor}` }}
      >
        <Icon name="refresh" size={20} className={isLoading ? 'animate-spin' : undefined} />
        <span>{t('lobby.game.playAgain')}</span>
      </button>
    ) : null
  ) : canAsk && rematch.askState !== 'sent' ? (
    <button
      type="button"
      onClick={() => {
        playCue('ui.confirm')
        void rematch.ask()
      }}
      disabled={rematch.askState === 'sending'}
      aria-busy={rematch.askState === 'sending' || undefined}
      className={PRIMARY_BUTTON_CLASS}
      style={{ background: accentColor, boxShadow: `0 4px 0 ${accentShadowColor}` }}
    >
      <Icon name="megaphone" size={20} />
      <span>{t('game.ui.askRematch')}</span>
    </button>
  ) : (
    <div className={PLATE_CLASS} role="status">
      {rematch.askState === 'sent' ? t('game.ui.rematchAsked') : t('game.ui.waitingForHost')}
    </div>
  )

  const mainView = (
    <div className="flex flex-col gap-5 p-5 pt-6 short-portrait:gap-4 short-portrait:pt-4 short-portrait:pb-4 short:grid short:grid-cols-2 short:items-center short:gap-x-6 short:gap-y-0 short:p-5">
      <div data-entrance="result" className="flex min-w-0 flex-col items-center text-center short:col-start-1 short:row-start-1">
        <div className="relative mb-4 grid size-[4.5rem] shrink-0 place-items-center short:mb-3 short-portrait:mb-2 short-portrait:size-14">
          {celebrate && <Celebration />}
          <div
            data-entrance="emblem"
            className="grid size-16 -rotate-6 place-items-center rounded-[1.125rem] border-2 border-bd-ink shadow-[0_4px_0_var(--bd-ink)] short-portrait:size-12"
            style={{ background: tile.background ?? accentColor, color: tile.color }}
          >
            {glyph}
          </div>
        </div>
        <h2
          id={titleId}
          className="max-w-full text-balance break-words font-display text-[clamp(1.75rem,7.5vw,2.5rem)] font-extrabold leading-[1.05] text-bd-ink short:text-[2rem]"
        >
          {title}
        </h2>
        {kicker && <p className="mt-1.5 text-sm font-semibold text-bd-ink-muted">{kicker}</p>}
        {solo && (
          <p
            id={standingsId}
            data-testid="game-result-standings"
            data-layout="solo"
            className="mt-3 font-display text-[clamp(2.5rem,11vw,3.25rem)] font-extrabold leading-none tabular-nums text-bd-ink"
          >
            {solo.score}
          </p>
        )}
        {versus && (
          <div className="relative mt-4 w-full">
            <ol
              id={standingsId}
              data-testid="game-result-standings"
              data-layout="versus"
              className="grid grid-cols-2 gap-x-10"
            >
              {versus.map((row) => (
                <li key={row.id} className="flex min-w-0 flex-col items-center">
                  <span className="max-w-full truncate text-sm font-semibold text-bd-ink-soft">{row.name}</span>
                  <span className="font-display text-[clamp(2.5rem,11vw,3.25rem)] font-extrabold leading-none tabular-nums text-bd-ink">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>
            <span aria-hidden="true" className="absolute bottom-1 left-1/2 -translate-x-1/2 font-display text-3xl font-bold text-bd-ink-muted">
              –
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 short-portrait:gap-3 short:col-start-2 short:row-span-2 short:row-start-1 short:gap-3">
        {ranked && (
          <ol
            id={standingsId}
            data-testid="game-result-standings"
            data-layout="ranked"
            className="flex flex-col gap-1"
          >
            {rankedRows.map(({ row, rank, gap }) => (
              <li
                key={row.id}
                data-viewer={row.isViewer ? 'true' : undefined}
                className={`grid h-9 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-bd-sm px-3 short:h-8 short-portrait:h-8 ${
                  row.isViewer ? 'bg-bd-sun/25' : rank === 1 ? 'bg-bd-bg2' : ''
                } ${gap ? 'mt-2' : ''}`}
              >
                <span className="font-display text-sm font-extrabold tabular-nums text-bd-ink-muted">
                  {t('game.ui.resultRank', { rank })}
                </span>
                <span className="truncate text-sm font-semibold text-bd-ink">
                  {row.name}
                  {row.isViewer && <span className="ml-1.5 text-xs font-semibold text-bd-sun-text">{t('game.ui.resultYou')}</span>}
                </span>
                <span className="font-display text-base font-extrabold tabular-nums text-bd-ink">{row.score}</span>
              </li>
            ))}
          </ol>
        )}

        <div data-testid="game-result-actions" data-entrance="actions" className="flex flex-col gap-3">
          {isHost && rematch.requestedBy && (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm font-bold text-bd-sun-text" role="status">
              <Icon name="megaphone" size={16} />
              <span>{t('game.ui.rematchWanted', { player: rematch.requestedBy })}</span>
            </p>
          )}
          {primary}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={handleInspect} className={SECONDARY_BUTTON_CLASS}>
              {t('game.ui.viewBoard')}
            </button>
            <button ref={moreButtonRef} type="button" onClick={openMore} data-testid="game-result-more-button" className={SECONDARY_BUTTON_CLASS}>
              <span>{t('game.ui.resultMore')}</span>
              <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </div>
      </div>

      {shown && isRegistered && !isGuest && (
        <div className="empty:hidden short:col-start-1 short:row-start-2 short:mt-3 short:self-start">
          <PushOptInNudge source="after_game" gameType={gameType} variant="line" />
        </div>
      )}
    </div>
  )

  const moreView = (
    <div ref={moreViewRef} data-testid="game-result-more" className="flex flex-col gap-3 p-4 short:p-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={closeMore} className={`${SECONDARY_BUTTON_CLASS} shrink-0`}>
          <Icon name="arrow-left" size={16} />
          <span>{t('game.ui.resultBack')}</span>
        </button>
        <p id={titleId} className="min-w-0 truncate font-display text-base font-bold text-bd-ink">{title}</p>
      </div>
      <div className="grid gap-1.5 short:grid-cols-2">
        {showReturn && (
          <button type="button" onClick={onReturnToLobby} disabled={isLoading} className={`${RESULT_MENU_ROW_CLASS} text-bd-ink`}>
            <Icon name="home" size={18} />
            <span className="min-w-0">{t('game.ui.returnToLobby')}</span>
          </button>
        )}
        {extraActions?.map((action) => (
          <button key={action.key} type="button" onClick={action.onClick} disabled={action.disabled} className={`${RESULT_MENU_ROW_CLASS} text-bd-ink`}>
            <Icon name={action.icon ?? 'arrow-right'} size={18} />
            <span className="min-w-0">{action.label}</span>
          </button>
        ))}
        <AfterGameActions
          variant="menu"
          inviteCode={inviteCode}
          gameType={gameType}
          isGuest={isGuest}
          isRegistered={isRegistered}
          gameId={gameId}
        />
        {onLeave && (
          <button
            type="button"
            onClick={() => {
              handleInspect()
              onLeave()
            }}
            className={`${RESULT_MENU_ROW_CLASS} text-bd-coral-text`}
          >
            <LeaveIcon size={18} />
            <span className="min-w-0">{t('game.ui.leave')}</span>
          </button>
        )}
      </div>
    </div>
  )

  return createPortal(
    <div
      ref={rootRef}
      data-testid="game-result-overlay"
      data-state={shown ? 'shown' : 'pending'}
      className="fixed inset-0 z-61 flex items-center justify-center p-4"
      // Pending: not seen, not clickable and not modal, so a tap meant for the board cannot hit Play again.
      style={shown ? undefined : { opacity: 0, pointerEvents: 'none' }}
      aria-hidden={shown ? undefined : true}
      inert={!shown}
    >
      <div
        data-testid="game-result-scrim"
        data-entrance="scrim"
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(31,27,22,0.45)] backdrop-blur-[4px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={view === 'main' && hasStandings ? standingsId : undefined}
        tabIndex={-1}
        data-outcome={visual}
        data-entrance="card"
        className="relative flex max-h-full w-full max-w-[25rem] flex-col overflow-y-auto overscroll-contain rounded-bd-lg border-[1.5px] border-bd-line bg-bd-card-warm shadow-bd-card outline-none short:max-w-[44rem]"
        style={view === 'more' && lockedHeight ? { minHeight: lockedHeight } : undefined}
      >
        {view === 'main' ? mainView : moreView}
      </div>
    </div>,
    document.getElementById('bd-lobby-portal') ?? document.body
  )
}
