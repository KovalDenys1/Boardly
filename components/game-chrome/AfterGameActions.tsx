'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import GuestConversionNudge from '@/components/GuestConversionNudge'
import PushOptInNudge from '@/components/PushOptInNudge'
import { Icon } from '@/components/icons'
import { useInviteShare } from '@/hooks/useInviteShare'
import { trackDiscordCta, type AnalyticsGameType } from '@/lib/analytics'

/**
 * The one after-game block, on every end screen (#982).
 *
 * The end of a game is the highest-intent moment in the product and the only one where a
 * player is choosing what to do next. Until this existed each end screen made its own
 * choice: share was on four of eight, the guest nudge on seven, and Discord — the only
 * channel that reaches the 92 % of players who never register — on none of them. One
 * component means a new next step lands everywhere at once instead of on whichever screen
 * someone remembered.
 *
 * It renders *below* the primary actions and stays quiet, for the reason CLAUDE.md gives
 * for keeping ads out of the overlay: anything competing with Play Again is competing with
 * the only action the player came for.
 *
 * Deliberately takes `isRegistered` as a prop rather than calling `useSession()`: this
 * block renders inside YahtzeeResults and SpyResults, which the i18n smoke test mounts
 * with no SessionProvider, and `useSession` throws outside one.
 */
export interface AfterGameActionsProps {
  /** Lobby code for "Play again with friends". Omit it and the share button is not rendered. */
  inviteCode?: string | null
  gameType: AnalyticsGameType
  isGuest?: boolean
  /**
   * Decided by the caller (`status === 'authenticated' && !isGuest`, minus spectators).
   * Slot 3 — the push opt-in ask (#984) — is gated on it.
   */
  isRegistered?: boolean
  registerUrl?: string
  /** 'overlay' = white-on-dark inside GameResultOverlay; 'card' = light tokens on a bespoke end screen. */
  variant?: 'overlay' | 'card'
  className?: string
}

/** The share CTA: readable against the dark overlay without competing with Play Again. */
const overlayShareBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 20px',
  borderRadius: 14,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.2)',
  border: '1px solid rgba(255,255,255,0.45)',
  color: '#fff',
}

const cardShareBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: '100%',
  padding: '10px 20px',
  borderRadius: 14,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  background: 'var(--bd-card-warm)',
  border: '1.5px solid var(--bd-line)',
  color: 'var(--bd-ink)',
}

export default function AfterGameActions({
  inviteCode,
  gameType,
  isGuest = false,
  isRegistered = false,
  registerUrl,
  variant = 'overlay',
  className,
}: AfterGameActionsProps) {
  const { t } = useTranslation()
  const shareInvite = useInviteShare(inviteCode)
  const isOverlay = variant === 'overlay'

  /**
   * Slot 3's gate. A guest has no account to attach a push subscription to, so the two
   * boxes below are mutually exclusive by construction and at most one ever appears.
   */
  const canAskForPush = isRegistered && !isGuest

  return (
    <div
      className={className}
      data-testid="after-game-actions"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}
    >
      {/* 1 — share */}
      {inviteCode && (
        <button
          onClick={() => void shareInvite('result_overlay')}
          style={isOverlay ? overlayShareBtn : cardShareBtn}
        >
          <Icon name="link" size={16} />
          <span>{t('game.ui.playAgainWithFriends')}</span>
        </button>
      )}

      {/* 2 — the Discord line. Always rendered: it is the only return channel that reaches a guest. */}
      <a
        href="/discord"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackDiscordCta('after_game', gameType)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '4px 2px',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          textDecoration: 'none',
          color: isOverlay ? 'rgba(255,255,255,0.7)' : 'var(--bd-ink-muted)',
        }}
      >
        <Icon name="chat" size={14} />
        <span>{t('game.ui.discordAfterGame')}</span>
      </a>

      {/*
        3 – the push opt-in ask (#984). It decides for itself whether it can be shown at
        all (VAPID key, browser support, permission, an existing subscription, a dismissal
        inside 30 days), so this gate is only about who it makes sense to ask.
      */}
      {canAskForPush && <PushOptInNudge source="after_game" gameType={gameType} />}

      {/* 4 — guest → account. Mutually exclusive with slot 3, so at most one box appears. */}
      {isGuest && registerUrl && (
        <div style={{ width: '100%' }}>
          <GuestConversionNudge registerUrl={registerUrl} />
        </div>
      )}
    </div>
  )
}
