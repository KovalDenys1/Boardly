'use client'

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import LeaveIcon from '@/components/LeaveIcon'
import GameLeaveButton from '@/components/game-chrome/GameLeaveButton'

/**
 * The header's actions (#1577): the spectate invite and Leave, or a spectator's
 * way back. Both forms are rendered and the header's container width picks one
 * (globals.css, `.game-header__actions-*`): side by side, or one menu on the
 * narrowest headers. The menu exists only when there is more than one action.
 */
export interface GameHeaderActionsProps {
  code: string
  isSpectator?: boolean
  onLeave?: () => void
  /** Whether the lobby admits spectators; only then is there a link worth sharing. */
  allowSpectators?: boolean
}

function MoreIcon() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="currentColor">
      <circle cx="3.5" cy="9" r="1.75" />
      <circle cx="9" cy="9" r="1.75" />
      <circle cx="14.5" cy="9" r="1.75" />
    </svg>
  )
}

// The panel sits in the top layer where the browser has it, because the header card
// clips its overflow and its size container traps a fixed panel inside it.
const supportsPopover = () => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype

export default function GameHeaderActions({ code, isSpectator = false, onLeave, allowSpectators = false }: GameHeaderActionsProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const inviteLabel = t('game.ui.inviteSpectators')
  const leaveLabel = t('game.ui.leave')
  const canInvite = allowSpectators && !isSpectator

  const copyInvite = () => {
    if (typeof window === 'undefined') return
    navigator.clipboard
      .writeText(`${window.location.origin}/lobby/${code}/spectate`)
      .then(() => showToast.success('toast.linkCopied'))
      .catch(() => showToast.error('toast.error'))
  }

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    const menu = menuRef.current
    if (menu && supportsPopover() && !menu.matches(':popover-open')) menu.showPopover()
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    const onViewportChange = () => close(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, close])

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  const exit = isSpectator
    ? <GameLeaveButton label={t('game.ui.backToLobby')} href={`/lobby/${code}`} variant="back" />
    : onLeave
      ? <GameLeaveButton label={leaveLabel} onClick={onLeave} />
      : null
  const hasMenu = canInvite && !!onLeave

  return (
    <div className="game-header__actions">
      <div className="game-header__actions-inline">
        {canInvite && (
          <button type="button" className="game-header__invite" onClick={copyInvite} aria-label={inviteLabel} title={inviteLabel}>
            <Icon name="eye" size={16} />
            <span className="game-header__invite-label">{inviteLabel}</span>
          </button>
        )}
        {exit}
      </div>
      {hasMenu && (
        <div className="game-header__actions-menu">
          <button
            ref={triggerRef}
            type="button"
            className="game-header__more"
            aria-label={t('game.ui.moreActions')}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => (open ? close(false) : setOpen(true))}
          >
            <MoreIcon />
          </button>
          {open && (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={t('game.ui.moreActions')}
              className="game-header__menu"
              popover={supportsPopover() ? 'manual' : undefined}
              style={position ? { top: position.top, right: position.right } : undefined}
              onKeyDown={onMenuKeyDown}
            >
              <button
                type="button"
                role="menuitem"
                className="game-header__menu-item"
                onClick={() => {
                  copyInvite()
                  close(true)
                }}
              >
                <Icon name="eye" size={16} />
                {inviteLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                className="game-header__menu-item game-header__menu-item--leave"
                onClick={() => {
                  close(false)
                  onLeave?.()
                }}
              >
                <LeaveIcon size={16} />
                {leaveLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
