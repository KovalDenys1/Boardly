'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'

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
 */
export interface GameStatusBannerProps {
  isFinished: boolean
  isDraw?: boolean
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

/** Single danger threshold for every game (was 5s in TTT/C4, 10s in Memory). */
const DANGER_SECONDS = 10

/**
 * `:07` for a turn timer, `4:51` once there are minutes on the clock.
 *
 * Every adopter until #905 ran a 30-120s turn timer, so two digits after a
 * colon was the whole format. Guess the Spy's question round is 300 seconds and
 * printed `:291`.
 */
function formatSeconds(secs: number): string {
  const safe = Math.max(0, Math.floor(secs))
  if (safe < 100) return `:${String(safe).padStart(2, '0')}`
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

  if (isFinished) {
    const badgeStyle: React.CSSProperties = {
      display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      border: '2px solid var(--bd-ink)', boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)',
      ...(isDraw
        ? { background: 'var(--bd-lav)', color: 'white' }
        : { background: 'var(--bd-sun)', color: 'var(--bd-ink)' }),
    }
    return (
      <div key={finishedMessage ?? 'finished'} className="game-status-cue" data-testid="game-status-title" style={{
        padding: '10px 16px', borderRadius: 14, background: 'var(--bd-ink)', color: 'var(--bd-bg)',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: `0 4px 0 ${isDraw ? 'var(--bd-lav)' : barColor}`,
      }}>
        <span style={badgeStyle}>{isDraw ? t('game.ui.drawBadge') : t('game.ui.victoryBadge')}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{finishedMessage}</span>
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
        {meta !== undefined && <span style={{ fontSize: 11, color: 'var(--bd-ink-muted)', marginLeft: 2 }}>{meta}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--bd-ink-muted)', whiteSpace: 'nowrap' }}>{t('game.ui.spectatingBadge')}</span>
      </div>
    )
  }

  const pct = turnTimerLimit > 0 ? (secs / turnTimerLimit) * 100 : 100
  const danger = secs <= DANGER_SECONDS
  // secs counts down, so elapsed is what the timer has already spent. With no
  // timer configured there is nothing to measure against, so no nudge.
  const elapsed = turnTimerLimit > 0 ? turnTimerLimit - secs : 0
  const showIdleNudge = showTimer && isYourTurn && turnTimerLimit > 0 && elapsed >= IDLE_NUDGE_SECONDS
  return (
    <>
    <div style={{
      padding: '10px 14px', borderRadius: 14, background: 'var(--bd-bg)',
      border: '1.5px solid var(--bd-line)', boxShadow: '0 4px 14px rgba(31,27,22,0.07)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {leadingIcon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div key={activeTitle} className="game-status-cue" data-testid="game-status-title" style={{ fontWeight: 700, fontSize: 13, color: 'var(--bd-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeTitle}
          {meta !== undefined && (
            <span style={{ color: 'var(--bd-ink-muted)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>{meta}</span>
          )}
        </div>
        {showTimer && (
          <div style={{ marginTop: 6, height: 5, background: 'var(--bd-bg2)', borderRadius: 999, overflow: 'hidden' }}>
            <div data-testid="game-status-timer-bar" style={{
              height: '100%', width: '100%',
              transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})`,
              transformOrigin: 'left center',
              background: danger ? 'var(--bd-coral)' : barColor,
              transition: 'transform 1s linear, background 0.2s',
            }} />
          </div>
        )}
      </div>
      {showTimer && (
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, minWidth: 44, textAlign: 'right',
          color: danger ? 'var(--bd-coral-deep)' : 'var(--bd-ink)',
        }}>
          {formatSeconds(secs)}
        </div>
      )}
      </div>
      {showIdleNudge && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 12,
          background: 'var(--bd-sun)', color: 'var(--bd-ink)',
          fontSize: 12, fontWeight: 700, textAlign: 'center',
          border: '1.5px solid var(--bd-ink)',
        }}>
          {t('game.ui.firstMoveNudge')}
        </div>
      )}
    </>
  )
}
