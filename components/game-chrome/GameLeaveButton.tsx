'use client'

import React from 'react'
import LeaveIcon from '@/components/LeaveIcon'
import { Icon } from '@/components/icons'

/**
 * The one Leave control every in-game screen shows, in the one place it
 * lives: the header's actions (GameHeaderActions, #1577). Lifted out of
 * MemoryGameBoard so TTT, Connect Four, RPS and every game after them stop
 * inventing their own.
 *
 * Spectators get the same place with `href` (a link back to the lobby) so the
 * corner is never empty for anyone. Its arrow shows only while the label is
 * hidden, since the label already starts with one.
 */
export interface GameLeaveButtonProps {
  /** Already-translated label ("Leave", "← Back to lobby"). */
  label: string
  onClick?: () => void
  /** Render as a link instead of a button (spectator's way out). */
  href?: string
  /** Icon-only below the compact breakpoint; the label stays for screen readers. */
  compact?: boolean
  variant?: 'leave' | 'back'
}

export default function GameLeaveButton({ label, onClick, href, compact = true, variant = 'leave' }: GameLeaveButtonProps) {
  const className = `game-leave-button game-leave-button--${variant}${compact ? ' game-leave-button--compact' : ''}`
  const content = (
    <>
      {variant === 'leave' && <LeaveIcon />}
      {variant === 'back' && (
        <span className="game-leave-button__back-icon" aria-hidden="true">
          <Icon name="arrow-left" size={16} />
        </span>
      )}
      <span className="game-leave-button__label">{label}</span>
    </>
  )

  if (href) {
    return (
      <a href={href} className={className} aria-label={label}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {content}
    </button>
  )
}
