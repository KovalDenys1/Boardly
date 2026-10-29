'use client'

import React, { useEffect, useState } from 'react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { noteLiveFinish } from '@/lib/live-finish'
import { Icon } from '@/components/icons'
import { useTurnTimerSounds } from '@/hooks/useTurnTimerSounds'
import { getTimerLevel } from '@/app/(site)/lobby/[code]/hooks/useGameTimer'

/**
 * Shared turn/result status banner (#736 phase 4) — replaces
 * TttStatusBanner / C4StatusBanner / MemoryStatusBanner, which had drifted:
 * timer danger threshold 5s vs 10s, win badge text vs emoji, spectator
 * variant present in only two of three. Unified: danger at ≤10s, text
 * badges via game.ui keys, spectator variant available to every adopter.
 *
 * Motion (#1111): the title line is keyed on its text, so a turn change
 * remounts it and `.game-status-cue` slides it in from 6px while it fades — the
 * eye catches the swap instead of reading the same box with new words. The
 * timer bar scales on the compositor (scaleX from the left) instead of
 * animating width, which relaid the banner every second.
 *
 * Low time (#1580) is drawn by the timer alone: the bar and the clock carry
 * `data-level` (useGameTimer's thresholds) and globals.css stripes the bar,
 * then fills it with ink, never by hue alone. The banner's own box never changes.
 */
/** The finished game seen from the viewer's seat. */
export type GameOutcome = 'win' | 'loss' | 'draw'

export interface GameStatusBannerProps {
  isFinished: boolean
  isDraw?: boolean
  /**
   * The viewer's result. Without it a finished, non-draw game shows the neutral
   * badge: only the caller knows who is looking, and a wrong VICTORY to the
   * loser is worse than no verdict.
   */
  outcome?: GameOutcome
  /** Already-translated result line ("Alice wins!", "It's a tie") — required when finished. */
  finishedMessage?: string
  /** Already-translated active-turn line ("Alice's turn"). */
  activeTitle: string
  /** Small trailing meta next to the title ("#5", "3/8"). */
  meta?: React.ReactNode
  secs: number
  turnTimerLimit: number
  /** Progress bar (and win-plate shadow) accent. */
  barColor: string
  /** Optional icon before the title (TTT mark, C4 disc). */
  leadingIcon?: React.ReactNode
  isSpectator?: boolean
  /** Whether the viewer is the acting player — drives the idle nudge below. */
  isYourTurn?: boolean
  /**
   * False for a phase that has no deadline (#905: Guess the Spy's role reveal
   * and results). With `secs` and `turnTimerLimit` both 0 the banner would
   * otherwise print a stopped `:00` over a full bar, which reads as "time is
   * up" on a phase that is simply untimed. The bar and the clock go; the line
   * and its meta stay.
   */
  showTimer?: boolean
}

/**
 * `:07` for a turn timer, `4:51` once there are minutes on the clock.
 *
 * Every adopter until #905 ran a 30-120s turn timer, so two digits after a
 * colon was the whole format. Guess the Spy's question round is 300 seconds and
 * printed `:291`.
 */
function formatSeconds(secs: number): string {
  const safe = Math.max(0, Math.floor(secs))
  if (safe < 60) return `:${String(safe).padStart(2, '0')}`
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * How long the acting player may sit on their turn before the banner says so.
 *
 * About a third of abandoned games never record a single move, and the roster
 * shows both players were present when the clock started — the game began with
 * everyone in place and nobody moved (#817). Rather than let the turn timer run
 * out in silence, say whose move it is once it is clearly not being noticed.
 */
const IDLE_NUDGE_SECONDS = 15

export default function GameStatusBanner({
  isFinished,
  isDraw = false,
  outcome,
  finishedMessage,
  activeTitle,
  meta,
  secs,
  turnTimerLimit,
  barColor,
  leadingIcon,
  isSpectator = false,
  isYourTurn = false,
  showTimer = true,
}: GameStatusBannerProps) {
  const { t } = useTranslation()
  // Every result overlay sits under this banner, and only the banner is mounted before the finish.
  const finishedRef = React.useRef(isFinished)
  useEffect(() => {
    if (isFinished && !finishedRef.current) noteLiveFinish()
    finishedRef.current = isFinished
  }, [isFinished])
  // A live region announces changes, not what it mounted with: it starts empty
  // and gets the hint after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useTurnTimerSounds(secs, !isFinished && !isSpectator && isYourTurn && showTimer && turnTimerLimit > 0)

  if (isFinished) {
    const result: GameOutcome | 'over' =
      isDraw || outcome === 'draw' ? 'draw' : isSpectator || !outcome ? 'over' : outcome
    const BADGE: Record<typeof result, { key: TranslationKeys; background: string; color: string; plate: string }> = {
      win: { key: 'game.ui.victoryBadge', background: 'var(--bd-sun)', color: 'var(--bd-ink-on-accent)', plate: barColor },
      loss: { key: 'game.ui.defeatBadge', background: 'var(--bd-coral)', color: 'var(--bd-ink-on-accent)', plate: 'var(--bd-coral)' },
      draw: { key: 'game.ui.drawBadge', background: 'var(--bd-lav)', color: 'var(--bd-ink-on-accent)', plate: 'var(--bd-lav)' },
      over: { key: 'game.ui.gameOverBadge', background: 'var(--bd-bg2)', color: 'var(--bd-ink)', plate: 'var(--bd-line)' },
    }
    const badge = BADGE[result]
    const badgeStyle: React.CSSProperties = {
      display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      border: '2px solid var(--bd-ink-on-accent)', boxShadow: '2px 2px 0 var(--bd-ink-on-accent)', fontFamily: 'var(--bd-font-display)',
      whiteSpace: 'nowrap', flexShrink: 0, background: badge.background, color: badge.color,
    }
    return (
      <div key={finishedMessage ?? 'finished'} className="game-status-cue" data-testid="game-status-title" data-outcome={result} style={{
        padding: '10px 16px', borderRadius: 14, background: 'var(--bd-inverse)', color: 'var(--bd-ink-on-inverse)',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: `0 4px 0 ${badge.plate}`,
      }}>
        <span style={badgeStyle}>{t(badge.key)}</span>
        <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0 }}>{finishedMessage}</span>
      </div>
    )
  }

  if (isSpectator) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
        border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="eye" size={16} tone="muted" />
        {leadingIcon}
        <span key={activeTitle} className="game-status-cue" data-testid="game-status-title" style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</span>
        {meta !== undefined && <span style={{ fontSize: 11, color: 'var(--bd-ink-soft)', marginLeft: 2 }}>{meta}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--bd-ink-soft)', whiteSpace: 'nowrap' }}>{t('game.ui.spectatingBadge')}</span>
      </div>
    )
  }

  const pct = turnTimerLimit > 0 ? (secs / turnTimerLimit) * 100 : 100
  const level = getTimerLevel(secs, turnTimerLimit)
  // secs counts down, so elapsed is what the timer has already spent. With no
  // timer configured there is nothing to measure against, so no nudge.
  const elapsed = turnTimerLimit > 0 ? turnTimerLimit - secs : 0
  const showIdleNudge = showTimer && isYourTurn && turnTimerLimit > 0 && elapsed >= IDLE_NUDGE_SECONDS
  // Idle (#1343): a ring in the player's colour pulses on the banner's own edge.
  return (
    <div
      className="game-status-banner"
      data-idle={showIdleNudge ? 'true' : undefined}
      style={{
        ['--game-status-accent' as string]: barColor,
        padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
        border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      {leadingIcon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div key={activeTitle} className="game-status-cue" data-testid="game-status-title" style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeTitle}
          {meta !== undefined && (
            <span style={{ color: 'var(--bd-ink-soft)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>{meta}</span>
          )}
        </div>
        {showTimer && (
          <div className="game-status-timer-track">
            <div data-testid="game-status-timer-bar" className="game-status-timer-fill" data-level={level} style={{
              height: '100%', width: '100%',
              transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})`,
              transformOrigin: 'left center',
              background: barColor,
              transition: 'transform 1s linear',
            }}>
              <span className="game-status-timer-fill__layer game-status-timer-fill__layer--low" />
              <span className="game-status-timer-fill__layer game-status-timer-fill__layer--critical" />
            </div>
          </div>
        )}
      </div>
      {showTimer && (
        <div className="game-status-clock" data-testid="game-status-timer" data-level={level}>
          <span className="game-status-clock__digits">{formatSeconds(secs)}</span>
        </div>
      )}
      <span role="status" className="sr-only">{mounted && showIdleNudge ? t('game.ui.firstMoveNudge') : ''}</span>
    </div>
  )
}
