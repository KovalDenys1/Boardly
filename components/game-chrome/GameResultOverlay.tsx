'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import GuestConversionNudge from '@/components/GuestConversionNudge'
import { Icon } from '@/components/icons'
import { useInviteShare } from '@/hooks/useInviteShare'

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
}

const ghostBtn: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 14,
  fontWeight: 600,
  fontSize: 14,
  background: 'rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.25)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
}

/** The share CTA: readable against the dark overlay without competing with Play Again. */
const shareBtn: React.CSSProperties = {
  ...ghostBtn,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontWeight: 700,
  background: 'rgba(255,255,255,0.2)',
  border: '1px solid rgba(255,255,255,0.45)',
  color: '#fff',
}

const platePlain: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 14,
  fontWeight: 600,
  fontSize: 14,
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(255,255,255,0.15)',
  textAlign: 'center',
  fontFamily: 'inherit',
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
}: GameResultOverlayProps) {
  const { t } = useTranslation()
  const shareInvite = useInviteShare(inviteCode)

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
        boxShadow: '0 0 0 3px rgba(255,255,255,0.15)',
      }}
    >
      <Icon name="trophy" size={30} tone="on-accent" />
    </div>
  )

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        background: 'rgba(31,27,22,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        overflowY: 'auto',
        zIndex: 10,
      }}
    >
      <div
        style={{
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '20px 16px',
          width: '100%',
        }}
      >
        {icon ?? defaultIcon}
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontFamily: 'ui-monospace,monospace',
            marginTop: 8,
            marginBottom: 2,
          }}
        >
          {kicker ?? t('game.ui.roundOver')}
        </div>
        <h2
          style={{
            fontFamily: 'var(--bd-font-display)',
            fontWeight: 800,
            fontSize: 'clamp(22px, 4vw, 28px)',
            color: '#fff',
            textAlign: 'center',
            margin: '0 0 14px',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
          <button onClick={onInspect} style={ghostBtn}>
            {t('game.ui.viewBoard')}
          </button>
          {actionsReplacement ?? (isHost ? (
            <>
              {onPlayAgain && (
                <button
                  onClick={onPlayAgain}
                  disabled={isLoading}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: 15,
                    background: accentColor,
                    color: 'white',
                    border: 'none',
                    boxShadow: `0 4px 0 ${accentShadowColor}`,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.65 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {isLoading ? '…' : t('lobby.game.playAgain')}
                </button>
              )}
              {onReturnToLobby && (
                <button
                  onClick={onReturnToLobby}
                  disabled={isLoading}
                  style={{ ...ghostBtn, opacity: isLoading ? 0.65 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                >
                  {t('game.ui.returnToLobby')}
                </button>
              )}
            </>
          ) : (
            <div style={platePlain}>{t('game.ui.waitingForHost')}</div>
          ))}
          {inviteCode && (
            <button onClick={() => void shareInvite('result_overlay')} style={shareBtn}>
              <Icon name="link" size={16} />
              <span>{t('game.ui.playAgainWithFriends')}</span>
            </button>
          )}
          {onLeave && (
            <button onClick={onLeave} style={ghostBtn}>
              {t('game.ui.leave')}
            </button>
          )}
        </div>
        {isGuest && registerUrl && (
          <div style={{ width: '100%', maxWidth: 260, marginTop: 8 }}>
            <GuestConversionNudge registerUrl={registerUrl} />
          </div>
        )}
      </div>
    </div>
  )
}
