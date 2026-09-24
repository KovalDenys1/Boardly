'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'

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
}: GamePlayerCardProps) {
  const { t } = useTranslation()
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
      <div className="game-player-avatar-wrap" style={{ position: 'relative', flexShrink: 0 }}>
        {avatarSrc ? (
          <img src={avatarSrc} alt={name} className="game-player-avatar" />
        ) : (
          <div className="game-player-avatar game-player-avatar--initial" style={{ background: accentColor }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {cornerBadge}
      </div>
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
            <span style={{
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
    </div>
  )
}
