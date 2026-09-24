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
  const justify = side === 'right' ? 'flex-end' : 'flex-start'

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
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {avatarSrc ? (
          <img src={avatarSrc} alt={name} className="game-player-avatar" />
        ) : (
          <div className="game-player-avatar game-player-avatar--initial" style={{ background: accentColor }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {cornerBadge}
      </div>
      {/* `minWidth: 0` alone let this resolve to 0px next to the unshrinkable
          42px avatar, so at 390 and in the 300px landscape side column the name,
          subline and turn line disappeared entirely instead of truncating — a
          player card with no player on it (#874). A floor plus `flex: 1 1 auto`
          means the card gives up characters, not the whole identity. */}
      <div className="game-player-identity" style={{ textAlign: side === 'right' ? 'right' : 'left' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: justify }}>
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isPremium ? 'var(--bd-premium)' : undefined }}>
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
          <div className="game-player-subline" style={{
            fontSize: 11, color: 'var(--bd-ink-muted)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{subline}</div>
        )}
        {isActive && (
          <div className="game-player-turn game-status-cue" style={{ justifyContent: justify }}>
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
