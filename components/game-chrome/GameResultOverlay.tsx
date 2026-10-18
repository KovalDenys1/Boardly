'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import AfterGameActions from '@/components/game-chrome/AfterGameActions'
import type { AnalyticsGameType } from '@/lib/analytics'
import { prefersReducedMotion } from '@/lib/motion'
import { useRematchSignal } from '@/hooks/useRematchSignal'
import { playCue } from '@/lib/sound-engine'
import { resultCue } from '@/lib/game-outcome'
import { liveFinishWithin } from '@/lib/live-finish'
import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'

/**
 * Shared end-of-game overlay (#736 phase 2) — one component for what used to
 * be TttResultModal / C4ResultOverlay / MemoryResultModal, which had drifted
 * (#737 scroll fix missing in one, Play Again loading state missing in
 * another, "View Board" vs "Tap to inspect" for the same action).
 *
 * Mounts absolutely over the whole board card (the mount point must be
 * position:relative). The outer layer scrolls and the inner wrapper's
 * margin:auto centers the content when it fits and lets it scroll from the
 * top when it doesn't — buttons can never be clipped on short screens
 * (#737, by construction for every adopter).
 *
 * Short boards (#1341): a phone in landscape leaves the board card ~274 px.
 * Play again is the one primary button; View board, Return to lobby and Leave
 * share one row under it, so outcome + Play again + Leave fit. The after-game
 * block follows below, and while anything is below the fold the scroller
 * fades out at its bottom edge so it reads as scrollable.
 *
 * Motion (#1111): every adopter mounts this in the same render that applies the
 * finishing move, so it used to cover the winning line before anyone saw it
 * land. It now waits `revealDelayMs` (invisible and click-through, still in the
 * DOM) and then fades in with the panel scaling up. No wait under
 * prefers-reduced-motion, and none when the player comes back from "View
 * board" to the same finish (`resultKey`) — they have already seen the board.
 */
export interface GameResultOverlayProps {
  /** Already-translated personalized title ("Alice wins!", "You win!", "It's a draw"). */
  title: string
  /** Small uppercase label above the icon; defaults to t('game.ui.roundOver'). */
  kicker?: string
  /** Custom icon slot (e.g. TTT's winner mark). Defaults to a trophy in a circle, or the handshake when isDraw. */
  icon?: React.ReactNode
  isDraw?: boolean
  /** Accent for the default trophy circle and the Play Again button. */
  accentColor?: string
  /** Deep accent for the Play Again button's hard shadow. */
  accentShadowColor?: string
  onInspect: () => void
  /** Host sees Play Again + Return to Lobby; others see the waiting plate. */
  isHost: boolean
  /** Disables Play Again / Return to Lobby while a restart is in flight. */
  isLoading?: boolean
  onPlayAgain?: () => void
  onReturnToLobby?: () => void
  onLeave?: () => void
  /** Replaces the host/non-host action block entirely (e.g. TTT's "Returning to lobby…" plate when a series completes). */
  actionsReplacement?: React.ReactNode
  isGuest?: boolean
  registerUrl?: string
  /**
   * Lobby code for "Play again with friends" (#927). The end of a game is the highest-intent
   * moment in the product and used to be a dead end; the button shares the same
   * `?via=invite` link the lobby header does. Omit it and the button is not rendered.
   */
  inviteCode?: string
  /** Tags the after-game block's Discord click, so the channel can be read per game (#982). */
  gameType: AnalyticsGameType
  /** `status === 'authenticated' && !isGuest`, decided by the caller — gates the push ask slot (#982). */
  isRegistered?: boolean
  /**
   * How long after mount the overlay stays invisible so the finishing move's
   * own animation can play (#1111). 0 shows it at once.
   */
  revealDelayMs?: number
  /**
   * Identifies this finish: the game id plus something that changes whenever a
   * game or round finishes again, e.g. `${game.id}:${state.lastMoveAt}` (#1111).
   * Coming back from "View board" skips the reveal wait only for the same key,
   * so a rematch or next round can never inherit the skip. Omit it and every
   * mount waits.
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
}

/** Long enough for a drop, a slide or a winning-line draw to finish (#1111). */
export const RESULT_REVEAL_DELAY_MS = 700

/**
 * "View board" unmounts the overlay in every adopter, and coming back mounts it
 * again. The overlay itself sees the click, so it notes which finish was being
 * inspected: a later mount with the same `resultKey` is a return, not a fresh
 * finish, and must not wait again. Keyed on the finish rather than on time or
 * game type, because several pages reset their inspect state on a rematch
 * without remounting the overlay, and the next game's overlay must still wait
 * (#1111 review).
 */
let inspectedResultKey: string | null = null

// Tried, not heard: a cue the engine dropped must not sound late on the way back from View board.
const soundedResultKeys = new Set<string>()

/** How long after a finish the banner saw the overlay may still announce it, on top of its reveal delay. */
const LIVE_FINISH_WINDOW_MS = 3000

function isReturnFromInspect(resultKey: string | undefined): boolean {
  return !!resultKey && inspectedResultKey === resultKey
}

/** Test seam: forget any pending "View board" note. */
export function resetResultOverlayRevealState(): void {
  inspectedResultKey = null
  soundedResultKeys.clear()
}

export default function GameResultOverlay({
  title,
  kicker,
  icon,
  isDraw = false,
  accentColor = 'var(--bd-mint)',
  accentShadowColor = 'var(--bd-mint-deep)',
  onInspect,
  isHost,
  isLoading = false,
  onPlayAgain,
  onReturnToLobby,
  onLeave,
  actionsReplacement,
  isGuest = false,
  registerUrl,
  inviteCode,
  gameType,
  isRegistered = false,
  gameId,
  isSpectator = false,
  canAskRematch = true,
  revealDelayMs = RESULT_REVEAL_DELAY_MS,
  resultKey,
  outcome,
}: GameResultOverlayProps) {
  const { t } = useTranslation()
  const canAsk = canAskRematch && !isSpectator && (isGuest || isRegistered) && !!inviteCode
  const rematch = useRematchSignal(canAsk ? inviteCode : null, gameId ?? resultKey ?? null)
  // Decided once, at mount: a later prop change must not hide a visible overlay.
  const [revealed, setRevealed] = useState(
    () => revealDelayMs <= 0 || prefersReducedMotion() || isReturnFromInspect(resultKey)
  )

  useEffect(() => {
    // A mount for any other finish makes the note stale for good.
    if (inspectedResultKey !== resultKey) inspectedResultKey = null
    if (revealed) return
    const timer = setTimeout(() => setRevealed(true), revealDelayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, [])

  // Not resultKey: its lastMoveAt changes when the server answers the winning move.
  const finishGameId = gameId ?? resultKey?.split(':')[0] ?? ''
  useEffect(() => {
    if (!revealed) return
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

  // Whether content sits below the fold: drives the bottom fade (#1341).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    if (el.firstElementChild) observer?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  const handleInspect = () => {
    inspectedResultKey = resultKey ?? null
    onInspect()
  }

  const defaultIcon = isDraw ? (
    <Icon name="handshake" size={44} />
  ) : (
    <div
      style={{
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: accentColor,
        display: 'grid',
        placeItems: 'center',
        boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.15)',
      }}
    >
      <Icon name="trophy" size={30} tone="on-accent" />
    </div>
  )

  const showReturn = !actionsReplacement && isHost && !!onReturnToLobby

  return (
    <div
      data-testid="game-result-overlay"
      data-state={revealed ? 'shown' : 'pending'}
      className="game-result-overlay"
      style={{
        // Pending: in the DOM (and in the accessibility tree) but not seen and
        // not clickable, so a tap meant for the board cannot hit Play Again.
        ...(revealed ? null : { opacity: 0, pointerEvents: 'none' as const }),
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        background: 'rgba(31,27,22,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        zIndex: 10,
      }}
    >
      <div
        ref={scrollRef}
        className="game-result-overlay__scroll"
        data-testid="game-result-overlay-scroll"
        data-more-below={moreBelow ? 'true' : 'false'}
      >
        <div className="game-result-overlay__panel">
          <div className="game-result-overlay__icon">{icon ?? defaultIcon}</div>
          <div className="game-result-overlay__kicker">{kicker ?? t('game.ui.roundOver')}</div>
          <h2 className="game-result-overlay__title">{title}</h2>
          <div className="game-result-overlay__actions">
            {isHost && rematch.requestedBy && (
              <div className="game-result-overlay__note" role="status">
                {t('game.ui.rematchWanted', { player: rematch.requestedBy })}
              </div>
            )}
            {actionsReplacement ?? (isHost ? (
              onPlayAgain && (
                <button
                  type="button"
                  onClick={() => {
                    playCue('ui.confirm')
                    onPlayAgain()
                  }}
                  disabled={isLoading}
                  className="game-result-overlay__primary"
                  style={{ background: accentColor, boxShadow: `0 4px 0 ${accentShadowColor}` }}
                >
                  {isLoading ? '…' : t('lobby.game.playAgain')}
                </button>
              )
            ) : canAsk && rematch.askState !== 'sent' ? (
              <button
                type="button"
                onClick={() => {
                  playCue('ui.confirm')
                  void rematch.ask()
                }}
                disabled={rematch.askState === 'sending'}
                className="game-result-overlay__primary"
                style={{ background: accentColor, boxShadow: `0 4px 0 ${accentShadowColor}` }}
              >
                {rematch.askState === 'sending' ? '…' : t('game.ui.askRematch')}
              </button>
            ) : (
              <div className="game-result-overlay__plate" role="status">
                {rematch.askState === 'sent' ? t('game.ui.rematchAsked') : t('game.ui.waitingForHost')}
              </div>
            ))}
            <div className="game-result-overlay__secondary" data-testid="game-result-secondary">
              <button type="button" onClick={handleInspect} className="game-result-overlay__ghost">
                {t('game.ui.viewBoard')}
              </button>
              {showReturn && (
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  disabled={isLoading}
                  className="game-result-overlay__ghost"
                >
                  {t('game.ui.returnToLobby')}
                </button>
              )}
              {onLeave && (
                <button type="button" onClick={onLeave} className="game-result-overlay__ghost">
                  {t('game.ui.leave')}
                </button>
              )}
            </div>
            {/*
              Under the primary actions, so it is also under `actionsReplacement` — TTT's
              "Returning to lobby…" plate keeps share and the Discord line beneath it (#982).
            */}
            <div className="game-result-overlay__more">
              <AfterGameActions
                variant="overlay"
                inviteCode={inviteCode}
                gameType={gameType}
                isGuest={isGuest}
                isRegistered={isRegistered}
                registerUrl={registerUrl}
                gameId={gameId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
