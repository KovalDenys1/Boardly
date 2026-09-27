'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import type { PlayerReportContext } from '@/components/PlayerProfileCard'

// Loaded on the first tap, so the scoreboard does not carry the card's modal.
const PlayerProfileCard = dynamic(() => import('@/components/PlayerProfileCard'), { ssr: false })

/**
 * Shared scoreboard player card (#736 phase 3) — one card for what used to
 * be TttPlayerCard / C4PlayerCard / MemoryPlayerCard (~90% identical per the
 * audit, with diverged behavior: Memory showed "Your turn" on the
 * opponent's active card). Games pass only their identity bits: an accent
 * color for the avatar fallback, an optional corner badge (TTT's mark tile,
 * C4's disc dot), and a subline ("X", "3W", "4 pairs").
 */
export interface GamePlayerCardProps {
  name: string
  isActive: boolean
  /** Whether this card is the local player — drives "Your turn" vs "Their turn". */
  isMe: boolean
  isWinner: boolean
  side: 'left' | 'right'
  avatarSrc?: string | null
  isPremium?: boolean
  /** Avatar fallback background (and default turn-dot color). */
  accentColor: string
  /** Small line under the name: symbol, win count, score. */
  subline?: React.ReactNode
  /** Badge pinned to the avatar's corner (TTT mark tile, C4 disc dot). */
  cornerBadge?: React.ReactNode
  /** Turn-indicator dot color; defaults to accentColor. */
  turnDotColor?: string
  /**
   * The player's user id. With it, another player's avatar opens their player card,
   * which carries the Report action (#1172); without it, or on your own card, the
   * avatar is not interactive.
   */
  userId?: string | null
  /** Where the card is, kept with a report as context. */
  lobbyCode?: string
  /** Sketch & Guess: the round this player is drawing, which their card then offers to report. */
  reportDrawing?: PlayerReportContext['drawing']
}

export default function GamePlayerCard({
  name,
  isActive,
  isMe,
  isWinner,
  side,
  avatarSrc,
  isPremium,
  accentColor,
  subline,
  cornerBadge,
  turnDotColor,
  userId,
  lobbyCode,
  reportDrawing,
}: GamePlayerCardProps) {
  const { t } = useTranslation()
  // Who the card was opened for, frozen at the tap: a seat can change hands while it
  // is open (Sketch & Guess hands the drawer's seat on every round), and a report
  // half-written about one player must not turn into a report about the next.
  const [openedFor, setOpenedFor] = useState<{ userId: string; context: PlayerReportContext } | null>(null)
  const opensCard = !!userId && !isMe
  const avatar = (
    <>
      {avatarSrc ? (
        // Inside the button the button's label names the player; the image would say it twice.
        <img src={avatarSrc} alt={opensCard ? '' : name} className="game-player-avatar" />
      ) : (
        <div className="game-player-avatar game-player-avatar--initial" style={{ background: accentColor }}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {cornerBadge}
    </>
  )
  // Sizing lives in app/globals.css (.game-player-card): an inline style
  // outranks every stylesheet rule, so the phone-landscape breakpoint could not
  // shrink this card while the numbers were here (#901). The active plate is
  // there too (#1111): a ::before layer that fades and settles from 96 % scale,
  // instead of `transition: all` repainting background, border and shadow.
  return (
    <div
      className={`game-player-card game-player-card--${side}${isActive ? ' game-player-card--active' : ''}`}
      data-active={isActive ? 'true' : 'false'}
    >
      {/* A button only where it does something: your own card, and a seat with no
          user behind it, stay a plain box. The avatar is the target, so the card
          gains no new control and no new row (#1172). */}
      {opensCard ? (
        <button
          type="button"
          className="game-player-avatar-wrap game-player-avatar-button"
          style={{ position: 'relative', flexShrink: 0 }}
          onClick={() => userId && setOpenedFor({ userId, context: { lobbyCode, drawing: reportDrawing ?? null } })}
          aria-label={t('report.openPlayerCard', { name })}
          aria-haspopup="dialog"
        >
          {avatar}
        </button>
      ) : (
        <div className="game-player-avatar-wrap" style={{ position: 'relative', flexShrink: 0 }}>
          {avatar}
        </div>
      )}
      {/* Alignment, truncation and the narrow stacked form live in
          app/globals.css (.game-player-identity and friends): an inline
          text-align or justify-content here outranked the container query that
          stacks the card on a phone, the same trap #901 hit with sizing (#1180). */}
      <div className="game-player-identity">
        <div className="game-player-name-row">
          <span className="game-player-name" style={{ color: isPremium ? 'var(--bd-premium)' : undefined }}>
            {name}
          </span>
          {isPremium && <Icon name="crown" size={14} tone="premium" label="Premium" />}
          {isWinner && (
            <span className="game-player-win-badge" style={{
              display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700,
              background: 'var(--bd-sun)', color: 'var(--bd-ink)', border: '2px solid var(--bd-ink)',
              boxShadow: '2px 2px 0 var(--bd-ink)', fontFamily: 'var(--bd-font-display)', whiteSpace: 'nowrap',
            }}>{t('game.ui.winBadge')}</span>
          )}
        </div>
        {subline !== undefined && (
          <div className="game-player-subline">{subline}</div>
        )}
        {isActive && (
          <div className="game-player-turn game-status-cue">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: turnDotColor ?? accentColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isMe ? t('game.ui.yourTurn') : t('game.ui.theirTurn')}
            </span>
          </div>
        )}
      </div>
      {openedFor && (
        <PlayerProfileCard
          userId={openedFor.userId}
          onClose={() => setOpenedFor(null)}
          reportContext={openedFor.context}
        />
      )}
    </div>
  )
}
