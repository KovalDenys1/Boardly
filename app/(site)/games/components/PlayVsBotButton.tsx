'use client'

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon, type IconName } from '@/components/icons'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { AuthGateModal } from '@/components/AuthGateModal'

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTIES: { id: Difficulty; icon: IconName; labelKey: TranslationKeys }[] = [
  { id: 'easy', icon: 'bot-easy' as const, labelKey: 'lobby.create.difficultyEasy' },
  { id: 'medium', icon: 'bot-medium' as const, labelKey: 'lobby.create.difficultyMedium' },
  { id: 'hard', icon: 'bot-hard' as const, labelKey: 'lobby.create.difficultyHard' },
]

interface PlayVsBotButtonProps {
  gameType: string
  className?: string
}

export default function PlayVsBotButton({ gameType, className = '' }: PlayVsBotButtonProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { status } = useSession()
  const { isGuest } = useGuest()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  /** The lobby the server says is still open, with the difficulty the player picked (#1344). */
  const [openLobby, setOpenLobby] = useState<{ code: string; difficulty: Difficulty } | null>(null)
  const popoverShown = open || openLobby !== null
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // The menu item that raised the dialog has unmounted, so focus moves into the
  // dialog on open and back to the trigger on close.
  const dialogWasOpen = useRef(false)
  useEffect(() => {
    if (openLobby) {
      dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    } else if (dialogWasOpen.current) {
      triggerRef.current?.focus()
    }
    dialogWasOpen.current = openLobby !== null
  }, [openLobby])

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    if (buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    if (!popoverShown) return
    const close = () => { setOpen(false); setOpenLobby(null) }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [popoverShown])

  const leaveAndPlay = async () => {
    if (!openLobby) return
    const { code, difficulty } = openLobby
    setOpenLobby(null)
    setLoading(true)
    try {
      const res = await fetchWithGuest(`/api/lobby/${encodeURIComponent(code)}/leave`, { method: 'POST' })
      // 404: the lobby is already gone, which is what leaving was for.
      if (!res.ok && res.status !== 404) throw new Error('Failed to leave')
    } catch (err) {
      showToast.error('errors.general', undefined, {
        message: err instanceof Error ? err.message : 'Something went wrong',
      })
      setLoading(false)
      return
    }
    await startQuickPlay(difficulty, { afterLeave: true })
  }

  const startQuickPlay = async (difficulty: Difficulty, { afterLeave = false } = {}) => {
    setLoading(true)
    try {
      const res = await fetchWithGuest('/api/quick-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, difficulty, forceSolo: true }),
      })
      const data = await res.json() as { lobbyCode?: string; error?: string; code?: string }
      if (res.status === 401) {
        // No client-side check can predict this one: a guest token expires or
        // is rejected while `isGuest` is still true locally. The answer is the
        // same as for a fresh visitor — offer the gate, never a raw
        // "Unauthorized" toast, which tells a player nothing they can act on.
        setLoading(false)
        setPendingDifficulty(difficulty)
        return
      }
      // Already has a game open (#907). Sending them there unasked read as the
      // button being broken (#1344), so they choose. A second refusal right
      // after leaving goes straight to that lobby rather than asking again.
      if (res.status === 409 && data.code === 'LOBBY_ALREADY_OPEN' && data.lobbyCode) {
        if (afterLeave) {
          router.push(`/lobby/${data.lobbyCode}`)
          return
        }
        setLoading(false)
        setOpen(false)
        setOpenLobby({ code: data.lobbyCode, difficulty })
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      router.push(`/lobby/${data.lobbyCode}`)
    } catch (err) {
      showToast.error('errors.general', undefined, {
        message: err instanceof Error ? err.message : 'Something went wrong',
      })
      setLoading(false)
      setOpen(false)
    }
  }

  const handleDifficulty = async (difficulty: Difficulty) => {
    // `!== 'authenticated'`, not `=== 'unauthenticated'`. NextAuth reports
    // `loading` for the first moments after mount, and a click inside that
    // window used to slip past this check and POST with no credentials — the
    // server answered 401 and the player got "An error occurred: Unauthorized"
    // on a page whose whole promise is that you can play without an account.
    // Erring towards the gate costs a signed-in player one dismissible modal
    // in a race they will rarely win; erring the other way costs a new visitor
    // the game.
    if (status !== 'authenticated' && !isGuest) {
      // Let a fresh visitor pick a guest name right here instead of bouncing
      // them to /auth/login — Play vs Bot is meant to work without an account.
      setPendingDifficulty(difficulty)
      return
    }

    await startQuickPlay(difficulty)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        onClick={() => {
          setOpenLobby(null)
          setOpen((value) => !value)
        }}
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`bd-btn bd-btn-soft bd-btn-lg w-full justify-center disabled:opacity-60 ${
          open ? 'bg-bd-bg2' : ''
        }`}
      >
        <Icon name="robot" size={16} /> {loading ? '…' : t('quickPlay.playVsBot')}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-2 min-w-44 overflow-hidden rounded-2xl border-2 border-bd-ink bg-bd-bg shadow-[0_6px_0_0_rgba(31,27,22,0.85)]"
        >
          {DIFFICULTIES.map(({ id, icon, labelKey }) => (
            <button
              key={id}
              role="menuitem"
              disabled={loading}
              onClick={() => {
                setOpen(false)
                void handleDifficulty(id)
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-bold text-bd-ink transition-colors hover:bg-bd-bg2 disabled:opacity-50"
            >
              <Icon name={icon} size={18} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      )}
      {openLobby && (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          onKeyDown={trapTab}
          aria-labelledby="play-vs-bot-open-lobby-title"
          aria-describedby="play-vs-bot-open-lobby-body"
          className="absolute left-0 right-0 top-full z-30 mt-2 min-w-60 rounded-2xl border-2 border-bd-ink bg-bd-bg p-4 shadow-[0_6px_0_0_rgba(31,27,22,0.85)]"
        >
          <p id="play-vs-bot-open-lobby-title" className="text-[15px] font-bold text-bd-ink">
            {t('quickPlay.openLobbyTitle')}
          </p>
          <p id="play-vs-bot-open-lobby-body" className="mt-1 text-sm text-bd-ink-soft">
            {t('quickPlay.openLobbyBody')}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void leaveAndPlay()}
              className="bd-btn bd-btn-primary min-h-11 w-full justify-center"
            >
              {t('quickPlay.openLobbyLeaveAndPlay')}
            </button>
            <button
              type="button"
              onClick={() => {
                const code = openLobby.code
                setOpenLobby(null)
                router.push(`/lobby/${code}`)
              }}
              className="bd-btn bd-btn-soft min-h-11 w-full justify-center"
            >
              {t('quickPlay.openLobbyGoBack')}
            </button>
          </div>
        </div>
      )}
      {pendingDifficulty && (
        <AuthGateModal
          dest={pathname}
          onClose={() => { setPendingDifficulty(null); setOpen(false) }}
          onGuestReady={() => {
            const difficulty = pendingDifficulty
            setPendingDifficulty(null)
            void startQuickPlay(difficulty)
          }}
        />
      )}
    </div>
  )
}
